"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Calculator as CalculatorIcon, Search } from "lucide-react";
import { Calculator } from "./Calculator";
import { CarCatalog } from "@/components/cars/CarCatalog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const triggerClass = "min-h-12 whitespace-normal px-2 py-2 text-xs data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";

export function CalculatorWorkspace() {
  const t = useTranslations("budget");
  const [active, setActive] = useState("calculator");
  return <Tabs value={active} onValueChange={setActive} className="min-w-0 flex-col gap-6">
    <TabsList className="grid h-auto min-h-14 w-full max-w-xl grid-cols-2 group-data-horizontal/tabs:h-auto">
      <TabsTrigger value="calculator" className={triggerClass}><CalculatorIcon className="h-4 w-4 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{t("calculatorTab")}</span></TabsTrigger>
      <TabsTrigger value="budget" className={triggerClass}><Search className="h-4 w-4 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{t("title")}</span></TabsTrigger>
    </TabsList>
    <TabsContent value="calculator" forceMount className="w-full min-w-0 data-[state=inactive]:hidden"><Calculator /></TabsContent>
    <TabsContent value="budget" forceMount className="w-full min-w-0 data-[state=inactive]:hidden"><CarCatalog active={active === "budget"} /></TabsContent>
  </Tabs>;
}
