export type Audience = "internal" | "customer" | "craftsman";

export type Visibility = "internal" | "customer" | "craftsman";

export type ProjectBundle = {
  project: {
    id: string;
    title: string;
    contractSumNok: number | null;
    status: string;
    address: string;
    sellerName: string;
    projectManagerName: string;
  };
  changeOrders: {
    id: string;
    title: string;
    description: string | null;
    amountNok: number | null;
    status: "draft" | "sent" | "approved" | "rejected";
    internalNote: string | null;
  }[];
  documents: { id: string; name: string; visibility: Visibility }[];
  media: { id: string; kind: string; internal: boolean; textContent: string | null; fileName: string | null }[];
  notes: { id: string; body: string; internal: boolean; roomId: string | null; sectionKey: string | null }[];
  answers: { id: string; itemId: string; value: unknown; freeText: string | null; internalNote: string | null }[];
  activities: { id: string; subject: string; note: string | null; internal: boolean }[];
};

/** Media og notater er interne med mindre de er eksplisitt merket som synlige. */
export function isCustomerVisibleFlag(internal: boolean | undefined): boolean {
  return internal === false;
}

const CUSTOMER_CHANGE_STATUSES = new Set(["sent", "approved", "rejected"]);

export function projectForAudience(bundle: ProjectBundle, audience: Audience): ProjectBundle {
  if (audience === "internal") {
    return structuredClone(bundle);
  }
  const customer = audience === "customer";
  return {
    project: {
      ...bundle.project,
      contractSumNok: customer ? bundle.project.contractSumNok : null,
    },
    changeOrders: customer
      ? bundle.changeOrders
          .filter((order) => CUSTOMER_CHANGE_STATUSES.has(order.status))
          .map((order) => ({ ...order, internalNote: null }))
      : [],
    documents: bundle.documents.filter((document) =>
      customer ? document.visibility === "customer" : document.visibility === "customer" || document.visibility === "craftsman",
    ),
    media: bundle.media.filter((item) => isCustomerVisibleFlag(item.internal)),
    notes: bundle.notes.filter((note) => isCustomerVisibleFlag(note.internal)),
    answers: bundle.answers.map((answer) => ({
      ...answer,
      internalNote: null,
    })),
    activities: [],
  };
}

export function containsInternalText(bundle: ProjectBundle, audience: Audience, secret: string): boolean {
  const view = projectForAudience(bundle, audience);
  return JSON.stringify(view).includes(secret);
}
