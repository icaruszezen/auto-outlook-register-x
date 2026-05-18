/**
 * WebSocket message types, organized by namespace.
 *
 * Wire-protocol mirrors of the backend services in `service/`:
 *   - RegisterWS  ↔ service/register_service.py
 *   - MonitorWS   ↔ service/monitor_service.py
 *   - AugmentWS   ↔ service/augment_service.py
 */

export namespace RegisterWS {
  export type LogMessage = {
    type: "log";
    message: string;
  };

  export type NeedConfirmMessage = {
    type: "need_confirm";
    message: string;
  };

  export type NeedConfirmSuccessMessage = {
    type: "need_confirm_success";
    message: string;
  };

  export type FinishedMessage = {
    type: "finished";
    success: boolean;
    user_info: Record<string, unknown>;
  };

  export type IncomingMessage =
    | LogMessage
    | NeedConfirmMessage
    | NeedConfirmSuccessMessage
    | FinishedMessage;

  export type ConfirmDoneMessage = { type: "confirm_done" };
  export type ConfirmSuccessMessage = {
    type: "confirm_success";
    success: boolean;
  };
  export type CloseBrowserMessage = { type: "close_browser" };
  export type StopMessage = { type: "stop" };

  export type OutgoingMessage =
    | ConfirmDoneMessage
    | ConfirmSuccessMessage
    | CloseBrowserMessage
    | StopMessage;
}

export namespace MonitorWS {
  export type EmailItem = {
    from: string;
    subject: string;
    date: string;
    body: string;
  };

  export type LogMessage = {
    type: "log";
    message: string;
  };

  export type EmailsMessage = {
    type: "emails";
    items: EmailItem[];
  };

  export type FinishedMessage = {
    type: "finished";
    success: boolean;
    message: string;
  };

  export type IncomingMessage =
    | LogMessage
    | EmailsMessage
    | FinishedMessage;

  export type StopMessage = { type: "stop" };

  export type OutgoingMessage = StopMessage;

  export type Query = {
    email: string;
    password: string;
    interval: number;
    use_api: boolean;
  };
}

export namespace AugmentWS {
  export type LogLevel = "info" | "warning" | "error" | "debug";

  export type LogMessage = {
    type: "log";
    level: LogLevel;
    message: string;
  };

  export type StartedMessage = {
    type: "started";
    email: string;
  };

  export type FinishedMessage = {
    type: "finished";
    success: boolean;
    message: string;
  };

  export type IncomingMessage =
    | LogMessage
    | StartedMessage
    | FinishedMessage;

  export type StopMessage = { type: "stop" };

  export type OutgoingMessage = StopMessage;
}
