export type Party = {
  id?: string;
  name?: string;
  roles?: string[];
  address?: {
    streetAddress?: string;
    locality?: string;
    postalCode?: string;
    countryName?: string;
    region?: string;
  };
  contactPoint?: { email?: string; name?: string; telephone?: string };
  identifier?: { scheme?: string; id?: string };
  details?: { url?: string; classifications?: { scheme?: string; id?: string; description?: string }[] };
};

export type Award = {
  suppliers?: { id?: string; name?: string }[];
  items?: { additionalClassifications?: { id?: string; description?: string }[] }[];
};

export type Contract = {
  id?: string;
  awardID?: string;
  title?: string;
  status?: string;
  period?: { startDate?: string; endDate?: string };
  value?: { amount?: number; amountGross?: number; currency?: string };
  dateSigned?: string;
  documents?: {
    id?: string;
    documentType?: string;
    noticeType?: string;
    description?: string;
    url?: string;
    datePublished?: string;
    format?: string;
  }[];
};

export type TenderRelease = {
  id?: string;
  ocid?: string;
  date?: string;
  tag?: string[];
  procurement_type?: string;
  initiationType?: string;
  planning?: {
    documents?: {
        id?: string;
        documentType?: string;
        noticeType?: string;
        description?: string;
        url?: string;
        datePublished?: string;
        format?: string;
    }[];
  };
  tender?: {
    id?: string;
    title?: string;
    description?: string;
    status?: string;
    procurementMethodDetails?: string;
    documents?: {
        id?: string;
        documentType?: string;
        noticeType?: string;
        description?: string;
        url?: string;
        datePublished?: string;
        format?: string;
    }[];
  };
  buyer?: { id?: string; name?: string };
  parties?: Party[];
  awards?: {
    suppliers?: { id?: string; name?: string }[];
    items?: { additionalClassifications?: { id?: string; description?: string }[] }[];
    documents?: {
        id?: string;
        documentType?: string;
        noticeType?: string;
        description?: string;
        url?: string;
        datePublished?: string;
        format?: string;
    }[];
  }[];
  contracts?: Contract[];
  [key: string]: unknown;
};

export type FetchTendersParams = {
  date?: string;
  limit?: string | number;
  stages?: string[] | string;
};

export type FetchTendersPageParams = {
  updatedTo?: string;
  limit?: string | number;
  stages?: string[] | string;
};
