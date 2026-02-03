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
  identifier?: { scheme?: string; id?: string; legalName?: string };
  details?: { 
    url?: string; 
    classifications?: { scheme?: string; id?: string; description?: string }[];
    scale?: string;
    vcse?: boolean;
  };
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
  aboveThreshold?: boolean;
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
  amendments?: { id?: string; description?: string; rationale?: string; date?: string }[];
  agreedMetrics?: { id?: string; title?: string }[];
  items?: { 
    id?: string; 
    description?: string; 
    classification?: { id?: string; description?: string; scheme?: string };
    additionalClassifications?: { id?: string; description?: string; scheme?: string }[];
    deliveryAddresses?: { region?: string; countryName?: string }[];
  }[];
};

export type TenderRelease = {
  id?: string;
  ocid?: string;
  date?: string;
  tag?: string[];
  opportunity_type?: string;
  initiationType?: string;
  tender?: {
    id?: string;
    title?: string;
    description?: string;
    status?: string;
    procurementMethod?: string;
    procurementMethodDetails?: string;
    procurementMethodRationale?: string;
    mainProcurementCategory?: string;
    classification?: { id?: string; description?: string; scheme?: string };
    legalBasis?: { id?: string; scheme?: string; uri?: string };
    coveredBy?: string[];

    items?: {
      id?: string;
      description?: string;
      classification?: { id?: string; description?: string; scheme?: string };
      additionalClassifications?: { id?: string; description?: string; scheme?: string }[];
      deliveryAddresses?: { region?: string; countryName?: string }[];
    }[];
    tenderPeriod?: { endDate?: string };
    enquiryPeriod?: { endDate?: string };
    awardPeriod?: { endDate?: string };
    submissionMethodDetails?: string;
    submissionTerms?: { languages?: string[]; electronicSubmissionPolicy?: string };
    techniques?: {
      hasFrameworkAgreement?: boolean;
      hasDynamicPurchasingSystem?: boolean;
      hasElectronicAuction?: boolean;
      frameworkAgreement?: { 
        type?: string; 
        description?: string;
        maximumParticipants?: number;
        method?: string;
        buyerCategories?: string;
      };
      dynamicPurchasingSystem?: {
        status?: string;
      };
    };
    communication?: {
      futureNoticeDate?: string;
    };
    participationFees?: {
      id?: string;
      type?: string[];
      description?: string;
      relativeValue?: { proportion?: number; monetaryValue?: string };
    }[];
    procurementMethodRationaleClassifications?: { scheme?: string; id?: string; description?: string }[];
    amendments?: { id?: string; description?: string; date?: string; rationale?: string }[];
    lots?: {
      id?: string;
      title?: string;
      description?: string;
      status?: string;
      contractPeriod?: { durationInDays?: number; startDate?: string; endDate?: string; maxExtentDate?: string };
      awardCriteria?: {
        criteria?: { name?: string; type?: string; description?: string; numbers?: { number?: number; weight?: string }[] }[];
      };
      selectionCriteria?: {
        criteria?: { type?: string; description?: string; verificationMethod?: string }[];
      };
      suitability?: { sme?: boolean; vcse?: boolean };
      hasOptions?: boolean;
      options?: { description?: string };
      hasRenewal?: boolean;
      renewal?: { description?: string };
    }[];
    procedure?: {
      features?: string;
    };
    hasRecurrence?: boolean;
    recurrence?: {
      dates?: { startDate?: string }[];
    };
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
  planning?: {
    milestones?: {
      id?: string;
      type?: string;
      description?: string;
      dueDate?: string;
      status?: string;
    }[];
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
    id?: string;
    date?: string;
    status?: string;
    suppliers?: { id?: string; name?: string }[];
    value?: { amount?: number; currency?: string };
    items?: { 
      id?: string; 
      description?: string; 
      classification?: { id?: string; description?: string; scheme?: string };
      additionalClassifications?: { id?: string; description?: string; scheme?: string }[] 
    }[];
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
  contracts?: (Contract & {
    amendments?: { id?: string; description?: string; rationale?: string }[];
    agreedMetrics?: { id?: string; title?: string }[];
  })[];
  bids?: {
    statistics?: { id?: string; measure?: string; value?: number }[];
  };
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
