import { z } from 'zod/v4';

export const ListParamsSchema = z.object({
  page: z.number().int().positive().optional(),
  perPage: z.number().int().positive().optional(),
  fields: z.string().optional(),
  name: z.string().optional(),
});

export const HostListParamsSchema = ListParamsSchema.extend({
  type: z
    .enum([
      'FileSystem',
      'FTP',
      'POP3',
      'Share',
      'siLock',
      'SMTP',
      'SSHFTP',
      'AS1',
      'AS2',
      'AS3',
      'S3',
    ])
    .optional(),
});

export const PgpListParamsSchema = z.object({
  page: z.number().int().positive().optional(),
  perPage: z.number().int().positive().optional(),
  fields: z.string().optional(),
  uid: z.string().optional(),
});

export const IdParamsSchema = z.object({ id: z.string().min(1) });

export const ReportQuerySchema = z.object({
  predicate: z.string().min(1),
  orderBy: z.string().optional(),
  maxCount: z.number().int().positive().max(10000).optional(),
});
