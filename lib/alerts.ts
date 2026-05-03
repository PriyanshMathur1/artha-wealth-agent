import { hasDatabase, prisma } from './db';

export type AlertType =
  | 'PRICE_TARGET_HIT'
  | 'STOP_LOSS_BREACH'
  | 'MF_UNDERPERFORM'
  | 'REBALANCE_DUE'
  | 'NAV_DROP'
  | 'NEW_52W_HIGH';

export async function createAlert(params: {
  userId: string;
  type: AlertType;
  title: string;
  message: string;
  severity?: 'low' | 'medium' | 'high';
  relatedSymbol?: string;
}) {
  if (!hasDatabase) {
    return {
      id: 0,
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      severity: params.severity ?? 'medium',
      relatedSymbol: params.relatedSymbol ?? '',
    };
  }

  return prisma.alert.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      severity: params.severity ?? 'medium',
      relatedSymbol: params.relatedSymbol ?? '',
    },
  });
}
