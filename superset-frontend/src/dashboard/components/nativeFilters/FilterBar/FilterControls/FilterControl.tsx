/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { memo, useContext, useMemo, useState } from 'react';
import {
  createHtmlPortalNode,
  InPortal,
  OutPortal,
} from 'react-reverse-portal';
import { styled, SupersetTheme, truncationCSS } from '@superset-ui/core';
import {
  FormItem as StyledFormItem,
  Form,
  Icons,
  Tooltip,
} from '@superset-ui/core/components';
import { FilterBarOrientation } from 'src/dashboard/types';
import { checkIsMissingRequiredValue } from '../utils';
import FilterValue from './FilterValue';
import { FilterCard } from '../../FilterCard';
import { FilterBarScrollContext } from '../Vertical';
import { FilterControlProps } from './types';
import { FilterCardPlacement } from '../../FilterCard/types';
import { useIsFilterInScope } from '../../state';

const FilterStyledIcon = styled.div`
  position: absolute;
  right: 0;
`;

const VerticalFilterControlTitle = styled.h4`
  font-size: ${({ theme }) => theme.fontSizeSM}px;
  color: ${({ theme }) => theme.colorText};
  overflow-wrap: anywhere;
`;

const HorizontalFilterControlTitle = styled(VerticalFilterControlTitle)`
  font-weight: ${({ theme }) => theme.fontWeightNormal};
  color: ${({ theme }) => theme.colorText};
  ${truncationCSS};
`;

const HorizontalOverflowFilterControlTitle = styled(
  HorizontalFilterControlTitle,
)`
  max-width: none;
`;

const VerticalFilterControlTitleBox = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const HorizontalFilterControlTitleBox = styled(VerticalFilterControlTitleBox)`
  margin-bottom: unset;
`;

const HorizontalOverflowFilterControlTitleBox = styled(
  VerticalFilterControlTitleBox,
)`
  width: 100%;
`;

const AllFilterControlContainer = styled(Form)`
  // TODO this is a hack related to having form items inside others which is not
  // normal antd-expected usage
  .ant-form-item .ant-form-item {
    margin-bottom: 0 !important;
  }
`;

const VerticalFilterControlContainer = styled(AllFilterControlContainer)`
  width: 100%;

  .ant-form-item {
    margin-bottom: ${({ theme }) => theme.sizeUnit * 2}px;
  }

  && .ant-form-item-label > label {
    text-transform: none;
    width: 100%;
    padding-right: ${({ theme }) => theme.sizeUnit * 11}px;
  }
  .ant-form-item-tooltip {
    margin-bottom: ${({ theme }) => theme.sizeUnit}px;
  }
`;

const HorizontalFilterControlContainer = styled(AllFilterControlContainer)`
  && .ant-form-item-label > label {
    margin-bottom: 0;
    text-transform: none;
  }
  .ant-form-item-tooltip {
    margin-bottom: ${({ theme }) => theme.sizeUnit}px;
  }
`;

const HorizontalOverflowFilterControlContainer = styled(
  VerticalFilterControlContainer,
)`
  && .ant-form-item-label {
    line-height: 1;
    & > label {
      padding-right: unset;
    }
  }
`;

const VerticalFormItem = styled(StyledFormItem)<{
  inverseSelection: boolean;
}>`
  .ant-form-item-label {
    overflow: visible;
    label.ant-form-item-required:not(.ant-form-item-required-mark-optional) {
      &::after {
        display: none;
      }
    }
  }

  .select-container {
    ${({ inverseSelection }) =>
      inverseSelection &&
      `
      width: 140px;
    `}
  }

  .select-bulk-actions {
    ${({ inverseSelection }) =>
      inverseSelection &&
      `
      flex-direction: column;
    `}
  }
`;

const HorizontalFormItem = styled(StyledFormItem)<{
  inverseSelection: boolean;
}>`
  && {
    margin-bottom: 0;
    align-items: center;
  }

  .ant-form-item-label {
    display: flex;
    align-items: center;
    overflow: visible;
    padding-bottom: 0;
    margin-right: ${({ theme }) => theme.sizeUnit * 2}px;
    label.ant-form-item-required:not(.ant-form-item-required-mark-optional) {
      &::after {
        display: none;
      }
    }

    & > label::after {
      display: none;
    }
  }

  .ant-form-item-control {
    min-width: ${({ inverseSelection }) => (inverseSelection ? 252 : 164)}px;
  }

  .select-container {
    ${({ inverseSelection }) =>
      inverseSelection &&
      `
      width: 164px;
    `}
  }

  .select-bulk-actions {
    flex-direction: column;
  }
`;

const HorizontalOverflowFormItem = VerticalFormItem;

const useFilterControlDisplay = (
  orientation: FilterBarOrientation,
  overflow: boolean,
  inverseSelection: boolean,
) =>
  useMemo(() => {
    if (orientation === FilterBarOrientation.Horizontal) {
      if (overflow) {
        return {
          FilterControlContainer: HorizontalOverflowFilterControlContainer,
          FormItem: (props: any) => (
            <HorizontalOverflowFormItem
              {...props}
              inverseSelection={inverseSelection}
            />
          ),
          FilterControlTitleBox: HorizontalOverflowFilterControlTitleBox,
          FilterControlTitle: HorizontalOverflowFilterControlTitle,
        };
      }
      return {
        FilterControlContainer: HorizontalFilterControlContainer,
        FormItem: (props: any) => (
          <HorizontalFormItem {...props} inverseSelection={inverseSelection} />
        ),
        FilterControlTitleBox: HorizontalFilterControlTitleBox,
        FilterControlTitle: HorizontalFilterControlTitle,
      };
    }
    return {
      FilterControlContainer: VerticalFilterControlContainer,
      FormItem: (props: any) => (
        <VerticalFormItem {...props} inverseSelection={inverseSelection} />
      ),
      FilterControlTitleBox: VerticalFilterControlTitleBox,
      FilterControlTitle: VerticalFilterControlTitle,
    };
  }, [orientation, overflow, inverseSelection]);

const ToolTipContainer = styled.div`
  font-size: ${({ theme }) => theme.fontSize}px;
  display: flex;
`;

const RequiredFieldIndicator = () => (
  <span
    css={(theme: SupersetTheme) => ({
      color: theme.colorError,
      fontSize: `${theme.fontSizeSM}px`,
      paddingLeft: '1px',
    })}
  >
    *
  </span>
);

const DescriptionToolTip = ({ description }: { description: string }) => (
  <ToolTipContainer>
    <Tooltip
      title={description}
      placement="right"
      overlayInnerStyle={{
        display: '-webkit-box',
        WebkitLineClamp: 10,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'normal',
      }}
    >
      <Icons.InfoCircleOutlined
        className="text-muted"
        role="button"
        css={(theme: SupersetTheme) => ({
          paddingLeft: `${theme.sizeUnit}px`,
        })}
      />
    </Tooltip>
  </ToolTipContainer>
);

const FilterControl = ({
  dataMaskSelected,
  filter,
  icon,
  onFilterSelectionChange,
  inView,
  showOverflow,
  parentRef,
  orientation = FilterBarOrientation.Vertical,
  overflow = false,
  clearAllTrigger,
  onClearAllComplete,
}: FilterControlProps) => {
  const portalNode = useMemo(() => createHtmlPortalNode(), []);
  const [isFilterActive, setIsFilterActive] = useState(false);

  const { name = '<undefined>' } = filter;

  const isFilterInScope = useIsFilterInScope();
  const isMissingRequiredValue =
    isFilterInScope(filter) &&
    checkIsMissingRequiredValue(filter, filter.dataMask?.filterState);
  const validateStatus = isMissingRequiredValue ? 'error' : undefined;
  const isRequired = !!filter.controlValues?.enableEmptyFilter;
  const inverseSelection = !!filter.controlValues?.inverseSelection;

  const {
    FilterControlContainer,
    FormItem,
    FilterControlTitleBox,
    FilterControlTitle,
  } = useFilterControlDisplay(orientation, overflow, inverseSelection);

  const label = useMemo(
    () => (
      <FilterControlTitleBox>
        <FilterControlTitle
          id={`filter-name-${filter.id}`}
          data-test="filter-control-name"
        >
          {name}
        </FilterControlTitle>
        {isRequired && <RequiredFieldIndicator />}
        {filter.description?.trim() && (
          <DescriptionToolTip description={filter.description} />
        )}
        <FilterStyledIcon data-test="filter-icon">{icon}</FilterStyledIcon>
      </FilterControlTitleBox>
    ),
    [
      FilterControlTitleBox,
      FilterControlTitle,
      name,
      isRequired,
      filter.description,
      icon,
    ],
  );

  const isScrolling = useContext(FilterBarScrollContext);
  const filterCardPlacement = useMemo(() => {
    if (orientation === FilterBarOrientation.Horizontal) {
      if (overflow) {
        return FilterCardPlacement.Left;
      }
      return FilterCardPlacement.Bottom;
    }
    return FilterCardPlacement.Right;
  }, [orientation, overflow]);

  return (
    <>
      <InPortal node={portalNode}>
        <FilterValue
          dataMaskSelected={dataMaskSelected}
          filter={filter}
          showOverflow={showOverflow}
          onFilterSelectionChange={onFilterSelectionChange}
          inView={inView}
          parentRef={parentRef}
          setFilterActive={setIsFilterActive}
          orientation={orientation}
          overflow={overflow}
          validateStatus={validateStatus}
          clearAllTrigger={clearAllTrigger}
          onClearAllComplete={onClearAllComplete}
        />
      </InPortal>
      <FilterControlContainer
        layout={
          orientation === FilterBarOrientation.Horizontal && !overflow
            ? 'horizontal'
            : 'vertical'
        }
      >
        <FilterCard
          filter={filter}
          isVisible={!isFilterActive && !isScrolling}
          placement={filterCardPlacement}
        >
          <div>
            <FormItem
              label={label}
              htmlFor={filter.id}
              required={filter?.controlValues?.enableEmptyFilter}
              validateStatus={validateStatus}
            >
              <OutPortal node={portalNode} />
            </FormItem>
          </div>
        </FilterCard>
      </FilterControlContainer>
    </>
  );
};

export default memo(FilterControl);
