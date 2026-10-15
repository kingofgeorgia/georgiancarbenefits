"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Calculator as CalculatorIcon, Search } from "lucide-react";
import { Calculator } from "./Calculator";
import { CarCatalog } from "@/components/cars/CarCatalog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function CalculatorWorkspace() {
  const t = useTranslations("budget");
  const [active, setActive] = useState("calculator");
  return <Tabs value={active} onValueChange={setActive} className="min-w-0 gap-6">
    <TabsList className="grid w-full max-w-xl grid-cols-2 group-data-horizontal/tabs:h-auto">
      <TabsTrigger value="calculator" className="min-h-12 whitespace-normal px-2 py-2"><CalculatorIcon className="h-4 w-4 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{t("calculatorTab")}</span></TabsTrigger>
      <TabsTrigger value="budget" className="min-h-12 whitespace-normal px-2 py-2"><Search className="h-4 w-4 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{t("title")}</span></TabsTrigger>
    </TabsList>
    <TabsContent value="calculator" forceMount className="data-[state=inactive]:hidden"><Calculator /></TabsContent>
    <TabsContent value="budget" forceMount className="data-[state=inactive]:hidden"><CarCatalog active={active === "budget"} /></TabsContent>
  </Tabs>;
}
