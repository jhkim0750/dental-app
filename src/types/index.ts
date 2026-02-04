export type RuleItemType =
  | "attachment"
  | "bos"
  | "vertical-ridge"
  | "power-ridge"
  | "bite-ramp"
  | "ipr";

export type Rule = {
  id: string;
  itemType: RuleItemType;
  tooth: string; // FDI notation, e.g. "13"
  startStep: number;
  endStep: number;
  note?: string;
};

export type ChecklistItem = {
  ruleId: string;
  itemType: RuleItemType;
  tooth: string;
  action: "new" | "remove" | "maintain";
  note?: string;
  checked: boolean;
};

export type Patient = {
  id: string;
  name: string;
  caseNumber: string; // 선생님 코드는 caseNumber
  totalSteps: number;
  clinic_name?: string; // 👈 [이 한 줄을 꼭 추가하세요!]
  rules: Rule[];
  checkedItems: Record<string, boolean>;
};

