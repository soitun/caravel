# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
from __future__ import annotations

import logging
from typing import Any

from flask import current_app
from flask_caching import Cache
from pandas import DataFrame

from superset.common.db_query_status import QueryStatus
from superset.constants import CacheRegion
from superset.exceptions import CacheLoadError
from superset.extensions import cache_manager
from superset.models.helpers import QueryResult
from superset.stats_logger import BaseStatsLogger
from superset.superset_typing import Column
from superset.utils.cache import set_and_log_cache
from superset.utils.core import error_msg_from_exception, get_stacktrace

logger = logging.getLogger(__name__)

_cache: dict[CacheRegion, Cache] = {
    CacheRegion.DEFAULT: cache_manager.cache,
    CacheRegion.DATA: cache_manager.data_cache,
}


class QueryCacheManager:
    """
    Class for manage query-cache getting and setting
    """

    @property
    def stats_logger(self) -> BaseStatsLogger:
        return current_app.config["STATS_LOGGER"]

    # pylint: disable=too-many-instance-attributes,too-many-arguments
    def __init__(
        self,
        df: DataFrame = DataFrame(),  # noqa: B008
        query: str = "",
        annotation_data: dict[str, Any] | None = None,
        applied_template_filters: list[str] | None = None,
        applied_filter_columns: list[Column] | None = None,
        rejected_filter_columns: list[Column] | None = None,
        status: str | None = None,
        error_message: str | None = None,
        is_loaded: bool = False,
        stacktrace: str | None = None,
        is_cached: bool | None = None,
        cache_dttm: str | None = None,
        cache_value: dict[str, Any] | None = None,
        sql_rowcount: int | None = None,
    ) -> None:
        self.df = df
        self.query = query
        self.annotation_data = {} if annotation_data is None else annotation_data
        self.applied_template_filters = applied_template_filters or []
        self.applied_filter_columns = applied_filter_columns or []
        self.rejected_filter_columns = rejected_filter_columns or []
        self.status = status
        self.error_message = error_message

        self.is_loaded = is_loaded
        self.stacktrace = stacktrace
        self.is_cached = is_cached
        self.cache_dttm = cache_dttm
        self.cache_value = cache_value
        self.sql_rowcount = sql_rowcount

    # pylint: disable=too-many-arguments
    def set_query_result(
        self,
        key: str,
        query_result: QueryResult,
        annotation_data: dict[str, Any] | None = None,
        force_query: bool | None = False,
        timeout: int | None = None,
        datasource_uid: str | None = None,
        region: CacheRegion = CacheRegion.DEFAULT,
    ) -> None:
        """
        Set dataframe of query-result to specific cache region
        """
        try:
            self.status = query_result.status
            self.query = query_result.query
            self.applied_template_filters = query_result.applied_template_filters
            self.applied_filter_columns = query_result.applied_filter_columns
            self.rejected_filter_columns = query_result.rejected_filter_columns
            self.error_message = query_result.error_message
            self.df = query_result.df
            self.sql_rowcount = query_result.sql_rowcount
            self.annotation_data = {} if annotation_data is None else annotation_data

            if self.status != QueryStatus.FAILED:
                current_app.config["STATS_LOGGER"].incr("loaded_from_source")
                if not force_query:
                    current_app.config["STATS_LOGGER"].incr(
                        "loaded_from_source_without_force"
                    )
                self.is_loaded = True

            value = {
                "df": self.df,
                "query": self.query,
                "applied_template_filters": self.applied_template_filters,
                "applied_filter_columns": self.applied_filter_columns,
                "rejected_filter_columns": self.rejected_filter_columns,
                "annotation_data": self.annotation_data,
                "sql_rowcount": self.sql_rowcount,
            }
            if self.is_loaded and key and self.status != QueryStatus.FAILED:
                self.set(
                    key=key,
                    value=value,
                    timeout=timeout,
                    datasource_uid=datasource_uid,
                    region=region,
                )
        except Exception as ex:  # pylint: disable=broad-except
            logger.exception(ex)
            if not self.error_message:
                self.error_message = str(ex)
            self.status = QueryStatus.FAILED
            self.stacktrace = get_stacktrace()

    @classmethod
    def get(
        cls,
        key: str | None,
        region: CacheRegion = CacheRegion.DEFAULT,
        force_query: bool | None = False,
        force_cached: bool | None = False,
    ) -> QueryCacheManager:
        """
        Initialize QueryCacheManager by query-cache key
        """
        query_cache = cls()
        if not key or not _cache[region] or force_query:
            return query_cache

        if cache_value := _cache[region].get(key):
            logger.debug("Cache key: %s", key)
            current_app.config["STATS_LOGGER"].incr("loading_from_cache")
            try:
                query_cache.df = cache_value["df"]
                query_cache.query = cache_value["query"]
                query_cache.annotation_data = cache_value.get("annotation_data", {})
                query_cache.applied_template_filters = cache_value.get(
                    "applied_template_filters", []
                )
                query_cache.applied_filter_columns = cache_value.get(
                    "applied_filter_columns", []
                )
                query_cache.rejected_filter_columns = cache_value.get(
                    "rejected_filter_columns", []
                )
                query_cache.status = QueryStatus.SUCCESS
                query_cache.is_loaded = True
                query_cache.is_cached = cache_value is not None
                query_cache.sql_rowcount = cache_value.get("sql_rowcount", None)
                query_cache.cache_dttm = (
                    cache_value["dttm"] if cache_value is not None else None
                )
                query_cache.cache_value = cache_value
                current_app.config["STATS_LOGGER"].incr("loaded_from_cache")
            except KeyError as ex:
                logger.exception(ex)
                logger.error(
                    "Error reading cache: %s",
                    error_msg_from_exception(ex),
                    exc_info=True,
                )
            logger.debug("Serving from cache")

        if force_cached and not query_cache.is_loaded:
            logger.warning(
                "force_cached (QueryContext): value not found for key %s", key
            )
            raise CacheLoadError("Error loading data from cache")
        return query_cache

    @staticmethod
    def set(
        key: str | None,
        value: dict[str, Any],
        timeout: int | None = None,
        datasource_uid: str | None = None,
        region: CacheRegion = CacheRegion.DEFAULT,
    ) -> None:
        """
        set value to specify cache region, proxy for `set_and_log_cache`
        """
        if key:
            set_and_log_cache(_cache[region], key, value, timeout, datasource_uid)

    @staticmethod
    def delete(
        key: str | None,
        region: CacheRegion = CacheRegion.DEFAULT,
    ) -> None:
        if key:
            _cache[region].delete(key)

    @staticmethod
    def has(
        key: str | None,
        region: CacheRegion = CacheRegion.DEFAULT,
    ) -> bool:
        return bool(_cache[region].get(key)) if key else False
