import type { SupabaseClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import { getSupabase } from '../db/supabase';
import type { ReceiptData, ReceiptRepository, ReceiptRow } from './ReceiptRepository';

export class SupabaseReceiptRepository implements ReceiptRepository {
    private readonly inMemory = new Map<string, ReceiptRow>();
    private readonly client: SupabaseClient | null;

    constructor(client?: SupabaseClient | null) {
        this.client = client ?? getSupabase();
    }

    async insertReceipt(input: {
        receiptType?: string;
        receiptText: string;
        receiptData?: ReceiptData;
    }): Promise<{ id: string }> {
        const id = nanoid();
        const row: ReceiptRow = {
            id,
            receipt_text: input.receiptText,
            receipt_data: input.receiptData ?? {},
        };
        if (input.receiptType !== undefined) row.receipt_type = input.receiptType;

        if (!this.client) {
            this.inMemory.set(id, row);
            return { id };
        }

        const { error } = await this.client
            .from('receipts')
            .insert({ id: row.id, receipt_text: row.receipt_text, receipt_data: row.receipt_data });

        if (error) throw error;
        return { id };
    }

    async getReceiptById(id: string): Promise<ReceiptRow | null> {
        if (!this.client) return this.inMemory.get(id) ?? null;

        const { data, error } = await this.client
            .from('receipts')
            .select('id, receipt_text, receipt_data')
            .eq('id', id)
            .single();

        if (error || !data) return null;

        return {
            id: String((data as any).id),
            receipt_text: String((data as any).receipt_text),
            receipt_data: ((data as any).receipt_data ?? {}) as ReceiptData,
        };
    }
}
