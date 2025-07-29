"use client";

import Loading from "@/app/components/base/loading";
import Button from "@/app/components/base/button";
import Word from "@/app/components/reports/Word";
import { RiCloseLine } from "@remixicon/react";
import type { ValueSelector} from "@/app/components/workflow/types";
import { VarType as VarKindType } from '@/app/components/workflow/nodes/tool/types'
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchReportTemplate, fetchReportDetail } from "@/service/reports";
import VariablePicker from "./variable-picker";

type ReportEditProps = {
  nodeId: string
  onAddVariable: (variableName: string, valueSelector: ValueSelector) => void
  onCancel: () => void;
};

// import SelectVar from "./SelectVar"
// save(fe) -> office(onlyofc) -> upload(be)
export default function ReportWordEdit({
  nodeId,
  onAddVariable,
  onCancel,
}: ReportEditProps) {
  const { t } = useTranslation();

  const { docx, loading, pageLoading, createDocx, importDocx } =
    useReport(nodeId);

  // inset var
  const iframeRef = useRef<HTMLElement>(null);
  const handleInset = (value: ValueSelector) => {
    const variableName = 'report_' + (typeof value === 'string' ? value : value.join('_'))
    onAddVariable(variableName, value)
    if (!iframeRef.current) return;
    const iframeDom = iframeRef.current.querySelector("iframe");
    if (!iframeDom) return;
    // console.log('value :>> ', value);
    iframeDom.contentWindow?.postMessage(
      JSON.stringify({
        type: "onExternalPluginMessage",
        action: "insetMarker",
        data: ` ${variableName} `,
      }),
      "*"
    );
  };
  //   const [show, setShow] = useState(true); // 处理var select聚焦问题

  if (pageLoading)
    return (
      <div className="absolute w-full h-full top-0 left-0 flex justify-center items-center z-10 bg-primary/20">
        <Loading />
      </div>
    );

  // new
  if (!docx.path) {
    return (
      <div className="relative size-full">
        <div className="absolute z-10 flex gap-4">
          <div className="absolute -right-11 top-6 z-[9999] flex flex-col items-center">
            <Button
              variant="tertiary"
              size="large"
              className="px-2"
              onClick={onCancel}
            >
              <RiCloseLine className="h-5 w-5" />
            </Button>
            <div className="system-2xs-medium-uppercase mt-1 text-text-tertiary">
              ESC
            </div>
          </div>
        </div>
        <div className="bg-accent size-full flex justify-center items-center">
          <div className="border rounded-md p-8 py-10 w-1/2 bg-card">
            <p className="text-xl">{t("report.reportTemplate")}</p>
            <p className="text-sm mt-2">{t("report.reportDescription")}</p>
            <div className="flex gap-2 mt-4">
              <Button className="w-full" onClick={createDocx}>
                {t("report.newButton")}
              </Button>
              <Button
                variant="secondary"
                disabled={loading}
                className="w-full border-gray-200"
                onClick={importDocx}
              >
                {loading && (
                  <span className="loading loading-spinner loading-sm pointer-events-none h-8 pl-3"></span>
                )}
                {t("report.importButton")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleVarReferenceChange = (value: ValueSelector | string, varKindType: VarKindType) => {
      handleInset(value)
  }

  return (
    <div className="absolute size-full">
      {loading && (
        <div className="absolute w-full h-full top-0 left-0 flex justify-center items-center z-10 bg-primary/20">
          <Loading />
        </div>
      )}
      <div className="flex size-full">
        <div ref={iframeRef} className="relative flex-1 border bg-accent">
          <div className="z-10 flex gap-4 pt-[8px] px-8">
            <div className="grow flex">
              <VariablePicker
                nodeId={nodeId}
                isShowNodeName={true}
                isAddBtnTrigger={false}
                className="grow"
                onChange={handleVarReferenceChange}
              />
            </div>
            <div className="fr top-6 z-[9999] flex flex-col items-center">
              <Button
                variant="tertiary"
                size="large"
                className="px-2"
                onClick={onCancel}
              >
                <RiCloseLine className="h-5 w-5" />
              </Button>
              <div className="system-2xs-medium-uppercase mt-1 text-text-tertiary">
                ESC
              </div>
            </div>
          </div>
          <Word data={docx} ></Word>
          {/* <LabelPanne onInset={handleInset}></LabelPanne> */}
        </div>
      </div>
    </div>
  );
}

const useReport = (nodeId: string) => {
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const [docx, setDocx] = useState({
    key: "",
    path: "",
  });

  useEffect(() => {
    if (nodeId) {
      (async () => {
        if (nodeId) {
          try {
            const detail = await fetchReportDetail(nodeId);
            setDocx({
              key: nodeId,
              path: detail.url,
            });
            setPageLoading(false);
          } catch {
            setHasError(true);
          }
        }
      })();
    } else {
      fetchReportTemplate().then((res) => {
        setPageLoading(false);
        setDocx({
          key: res.version_key,
          path: res.url,
        });
        console.warn("REPORT:读取报告所用KEY是 :>> ", nodeId);
        console.warn("REPORT:读取报告所后变更KEY是 :>> ", res.version_key);
      });
    }
  }, [nodeId]);

  const handleCreate = async () => {
    // 本地调试
    setDocx((docx) => ({
      ...docx,
      path: "http://192.168.156.100:3001/empty.docx",
    }));
    // setDocx(doc => ({ ...docx, path: basePath + '/empty.docx' }))// 文档服务能访问到的文件地址
  };

  const handleImport = () => {
    // 上传
    // Create a file input element
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".doc, .docx";
    input.style.display = "none"; // Hidden from view
    input.multiple = false; // Allow only one file selection

    input.onchange = (e: Event) => {
      setLoading(true);

      // Get the selected file
      const file = (e.target as HTMLInputElement).files?.[0];
      // uploadFileWithProgress(file, (progress) => { }).then(res => {
      //     setLoading(false);
      //     setDocx(docx => ({ ...docx, path: res.file_path }))
      // })
    };

    input.click();
  };

  return {
    loading,
    pageLoading,
    docx,
    createDocx: handleCreate,
    importDocx: handleImport,
  };
};
