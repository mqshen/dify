"use client";

import Loading from "@/app/components/base/loading";
import Button from "@/app/components/base/button";
import Word from "@/app/components/reports/Word";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
// import { ChevronDown, ChevronLeft } from "lucide-react"
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchReportTemplate, fetchReportDetail } from "@/service/reports";
import type { Report } from "@/models/reports";
import { basePath } from "@/utils/var";

type ReportEditProps = {
  reportId?: string;
  nodeId?: string;
};

// import SelectVar from "./SelectVar"
// save(fe) -> office(onlyofc) -> upload(be)
export default function ReportWordEdit({
  reportId,
  nodeId,
}: ReportEditProps) {
  const { t } = useTranslation();

  const { docx, loading, pageLoading, createDocx, importDocx } = useReport(
    reportId,
  );

  // inset var
  const iframeRef = useRef<HTMLElement>(null);
  const handleInset = (value: any) => {
    if (!iframeRef.current) return;
    const iframeDom = iframeRef.current.querySelector("iframe");
    if (!iframeDom) return;
    // console.log('value :>> ', value);
    iframeDom.contentWindow?.postMessage(
      JSON.stringify({
        type: "onExternalPluginMessage",
        action: "insetMarker",
        data: value,
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
  if (!docx.path)
    return (
      <div className="relative size-full">
        <div className="absolute -top-10 z-10 flex gap-4">
          {/* <DialogClose className="">
                <Button variant="outline" size="icon" className="bg-[#fff] size-8"><ChevronLeftIcon /></Button>
            </DialogClose> */}
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

  return (
    <div className="relative size-full">
      {loading && (
        <div className="absolute w-full h-full top-0 left-0 flex justify-center items-center z-10 bg-primary/20">
          <Loading />
        </div>
      )}
      <div className="flex h-full">
        <div ref={iframeRef} className="relative flex-1 border bg-accent">
          <div className="absolute -top-10 z-10 flex gap-4">
            {/* <DialogClose className="">
                        <Button variant="outline" size="icon" className="bg-[#fff] size-8"><ChevronLeftIcon /></Button>
                    </DialogClose>
                    {show && <SelectVar nodeId={nodeId} itemKey={''} onSelect={(E, v) => {
                        handleInset(`${E.id}.${v.value}`)
                        setShow(false)
                        setTimeout(() => {
                            setShow(true)
                        }, 1);
                    }}>
                        <Button className="h-8">{t('inserVar')}<ChevronDownIcon size={14} /></Button>
                    </SelectVar>} */}
          </div>
          <Word data={docx} workflow></Word>
          {/* <LabelPanne onInset={handleInset}></LabelPanne> */}
        </div>
      </div>
    </div>
  );
}

const useReport = (reportId?: string) => {
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const [docx, setDocx] = useState({
    key: "",
    path: "",
  });

  useEffect(() => {
    if (reportId) {
      (async () => {
        if (reportId) {
          try {
            const detail = await fetchReportDetail(reportId);
            setDocx({
              key: reportId,
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
        console.warn("REPORT:读取报告所用KEY是 :>> ", reportId);
        console.warn("REPORT:读取报告所后变更KEY是 :>> ", res.version_key);
      });
    }
  }, [reportId]);

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
