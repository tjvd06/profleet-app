export type EmailSendResult = {
  id: string | null;
  error: Error | null;
};

export type EmailRecipient = {
  email: string;
  firstName?: string | null;
};
