import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { app } from '../index'; // Ensure this is updated to reflect the correct named import

describe('POST /api/receipts', () => {
    it('should return 201 and a url for simple shape', async () => {
        const response = await request(app)
            .post('/api/receipts')
            .send({
                receiptText: 'Sample Receipt Text'
            });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('url');
        expect(response.body).toHaveProperty('id');
        expect(response.body.qrPayload).toEqual(expect.stringContaining('/r/'));
    });

    it('should return 201 and a url for wrapper shape', async () => {
        const response = await request(app)
            .post('/api/receipts')
            .send({
                payload: {
                    receiptText: 'Sample Receipt Text'
                }
            });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('url');
        expect(response.body).toHaveProperty('id');
        expect(response.body.qrPayload).toEqual(expect.stringContaining('/r/'));
    });

    it('should return 201 and a url for the new preferred contract', async () => {
        const response = await request(app)
            .post('/api/receipts')
            .send({
                receipt: {
                    text: 'Sample Receipt Text',
                    type: 'CUSTOMER',
                    data: { key: 'value' }
                },
                context: { additionalKey: 'additionalValue' }
            });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('url');
        expect(response.body).toHaveProperty('id');
        expect(response.body.qrPayload).toEqual(expect.stringContaining('/r/'));
    });
});