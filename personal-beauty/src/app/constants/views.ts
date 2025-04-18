// src/constants/views.ts
export const VIEWS = {
    HOME: "home",
    PERSONAL_COLOR: "personal-color",
    PERSONAL_MAKEUP: "personal-makeup",
    COSMETIC_SURGERY: "cosmetic-surgery",
    HAIR_COLOR: "hair-color",
    PERSONAL_BODY_TYPE: "personal-body-type",
  } as const;
  
  export type ViewType = (typeof VIEWS)[keyof typeof VIEWS];
  
  export const VIEW_LIST: { name: string; view: ViewType }[] = [
    { name: "Personal Color", view: VIEWS.PERSONAL_COLOR },
    { name: "Personal Makeup", view: VIEWS.PERSONAL_MAKEUP },
    { name: "Cosmetic Surgery", view: VIEWS.COSMETIC_SURGERY },
    { name: "Hair Color", view: VIEWS.HAIR_COLOR },
    { name: "Personal Body Type", view: VIEWS.PERSONAL_BODY_TYPE },
  ];