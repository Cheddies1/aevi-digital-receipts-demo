export type ReceiptContext = Record<string, unknown> & {
    timestamp?: string;
    terminalId?: string;
    merchantId?: string;
    transactionId?: string;
};

export type ReceiptData = Record<string, unknown> & {
    context?: ReceiptContext;
    amount?: string | number;
    currency?: string;
    cardBrand?: string;
    truncatedPAN?: string;
    authorizationCode?: string;
    responseMessage?: string;
    responseCode?: string;
    transactionType?: string;
    transactionDateTime?: string;
    terminalId?: string;
    merchantId?: string;
    transactionId?: string;
};

export interface ReceiptRow {
    id: string;
    receipt_text: string;
    receipt_type?: string;
    receipt_data: ReceiptData;
}

export interface ReceiptRepository {
    insertReceipt(input: { receiptType?: string; receiptText: string; receiptData?: ReceiptData }): Promise<{ id: string }>;
    getReceiptById(id: string): Promise<ReceiptRow | null>;
}
