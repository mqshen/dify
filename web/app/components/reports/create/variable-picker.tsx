"use client";
import type { FC } from "react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import produce from "immer";
import { useReactFlow, useStoreApi } from "reactflow";
import cn from "@/utils/classnames";
import type {
  Node,
  NodeOutPutVar,
  ValueSelector,
  Var,
} from "@/app/components/workflow/types";
import type { CredentialFormSchema } from "@/app/components/header/account-setting/model-provider-page/declarations";
import { BlockEnum } from "@/app/components/workflow/types";
import useAvailableVarList from "@/app/components/workflow/nodes/_base/hooks/use-available-var-list";
import {
  PortalToFollowElem,
  PortalToFollowElemContent,
  PortalToFollowElemTrigger,
} from "@/app/components/base/portal-to-follow-elem";
import {
  useIsChatMode,
  useWorkflowVariables,
} from "@/app/components/workflow/hooks";
import { VarType as VarKindType } from "@/app/components/workflow/nodes/tool/types";
import Button from "@/app/components/base/button";
import { noop } from "lodash-es";
import VarFullPathPanel from "@/app/components/workflow/nodes/_base/components/variable/var-full-path-panel";
import { varTypeToStructType } from "@/app/components/workflow/nodes/_base/components/variable/utils";
import VarReferencePopup from "@/app/components/workflow/nodes/_base/components/variable/var-reference-popup";

const TRIGGER_DEFAULT_WIDTH = 227;

type Props = {
  className?: string;
  nodeId: string;
  isShowNodeName?: boolean;
  onChange: (
    value: ValueSelector | string,
    varKindType: VarKindType,
    varInfo?: Var
  ) => void;
  onOpen?: () => void;
  isSupportConstantValue?: boolean;
  defaultVarKindType?: VarKindType;
  onlyLeafNodeVar?: boolean;
  filterVar?: (payload: Var, valueSelector: ValueSelector) => boolean;
  availableNodes?: Node[];
  availableVars?: NodeOutPutVar[];
  isAddBtnTrigger?: boolean;
  schema?: Partial<CredentialFormSchema>;
  valueTypePlaceHolder?: string;
  isInTable?: boolean;
  onRemove?: () => void;
  typePlaceHolder?: string;
  isSupportFileVar?: boolean;
  placeholder?: string;
  minWidth?: number;
  popupFor?: "assigned" | "toAssigned";
  zIndex?: number;
};

const VariablePicker: FC<Props> = ({
  nodeId,
  className,
  onOpen = noop,
  onChange,
  isSupportConstantValue,
  defaultVarKindType = VarKindType.constant,
  onlyLeafNodeVar,
  filterVar = () => true,
  availableNodes: passedInAvailableNodes,
  availableVars: passedInAvailableVars,
  isAddBtnTrigger,
}) => {
  const { t } = useTranslation();
  const store = useStoreApi();
  const { getNodes } = store.getState();
  const isChatMode = useIsChatMode();

  const { getCurrentVariableType } = useWorkflowVariables();
  const { availableVars, availableNodesWithParent: availableNodes } =
    useAvailableVarList(nodeId, {
      onlyLeafNodeVar,
      passedInAvailableNodes,
      filterVar,
    });

  const startNode = availableNodes.find((node: any) => {
    return node.data.type === BlockEnum.Start;
  });

  const node = getNodes().find((n) => n.id === nodeId);
  const isInIteration = !!node?.data.isInIteration;
  const iterationNode = isInIteration
    ? getNodes().find((n) => n.id === node.parentId)
    : null;

  const isInLoop = !!node?.data.isInLoop;
  const loopNode = isInLoop
    ? getNodes().find((n) => n.id === node.parentId)
    : null;

  const triggerRef = useRef<HTMLDivElement>(null);
  const [triggerWidth, setTriggerWidth] = useState(TRIGGER_DEFAULT_WIDTH);
  useEffect(() => {
    if (triggerRef.current) setTriggerWidth(triggerRef.current.clientWidth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerRef.current]);

  const [varKindType, setVarKindType] =
    useState<VarKindType>(defaultVarKindType);

  const outputVars = useMemo(
    () => passedInAvailableVars || availableVars,
    [passedInAvailableVars, availableVars]
  );

  const [open, setOpen] = useState(false);
  useEffect(() => {
    onOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);


  const type = getCurrentVariableType({
    parentNode: isInIteration ? iterationNode : loopNode,
    valueSelector: [""] as ValueSelector,
    availableNodes,
    isChatMode,
    isConstant: false,
  });

  const WrapElem = isSupportConstantValue ? "div" : PortalToFollowElemTrigger;
  const handleVarReferenceChange = useCallback(
    (value: ValueSelector, varInfo: Var) => {
      // sys var not passed to backend
      const newValue = produce(value, (draft) => {
        if (draft[1] && draft[1].startsWith("sys.")) {
          draft.shift();
          const paths = draft[0].split(".");
          paths.forEach((p, i) => {
            draft[i] = p;
          });
        }
      });
      onChange(newValue, varKindType, varInfo);
      setOpen(false);
    },
    [onChange, varKindType]
  );

  return (
    <div className={cn(className, "cursor-pointer")}>
      <PortalToFollowElem
        open={open}
        onOpenChange={setOpen}
        placement={isAddBtnTrigger ? "bottom-end" : "bottom-start"}
      >
        <WrapElem
          onClick={() => {
            setOpen(!open);
          }}
          className="group/picker-trigger-wrap relative !flex"
        >
          <Button
            className="h-9 text-sm font-medium text-text-secondary"
            // onClick={showRemoveConfirm}
          >
            <span>{t("report.addVar")}</span>
          </Button>
        </WrapElem>
        <PortalToFollowElemContent
          style={{
            zIndex: 100,
          }}
          className="mt-1"
        >
            <VarReferencePopup
              vars={outputVars}
              popupFor={"assigned"}
              onChange={handleVarReferenceChange}
              itemWidth={420}
              isSupportFileVar={false}
            />
        </PortalToFollowElemContent>
      </PortalToFollowElem>
    </div>
  );
};
export default React.memo(VariablePicker);
