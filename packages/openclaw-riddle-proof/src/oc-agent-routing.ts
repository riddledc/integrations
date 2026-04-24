export type OpenClawAgentRoutingMode = "agent_session_id" | "gateway_session_key";

export type OpenClawAgentThinking = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface OpenClawAgentInvocationRequest {
  agentId: string;
  sessionId: string;
  message: string;
  thinking?: OpenClawAgentThinking;
  timeoutSeconds?: number;
  deliver?: boolean;
}

export interface OpenClawAgentInvocationPlan {
  routingMode: OpenClawAgentRoutingMode;
  command: string;
  args: string[];
  sessionKey: string;
}

export function buildOpenClawAgentSessionKey(agentId: string, sessionId: string) {
  return `agent:${agentId}:${sessionId}`;
}

export function buildOpenClawAgentInvocationPlan(
  request: OpenClawAgentInvocationRequest,
  routingMode: OpenClawAgentRoutingMode = "agent_session_id",
): OpenClawAgentInvocationPlan {
  const thinking = request.thinking ?? "minimal";
  const timeoutSeconds = request.timeoutSeconds ?? 180;
  const deliver = request.deliver ?? false;
  const sessionKey = buildOpenClawAgentSessionKey(request.agentId, request.sessionId);

  if (routingMode === "gateway_session_key") {
    return {
      routingMode,
      command: "openclaw",
      args: [
        "gateway",
        "call",
        "agent",
        "--params",
        JSON.stringify({
          agentId: request.agentId,
          sessionKey,
          message: request.message,
          thinking,
          deliver,
        }),
        "--expect-final",
        "--timeout",
        String(timeoutSeconds * 1000),
        "--json",
      ],
      sessionKey,
    };
  }

  const args = [
    "agent",
    "--agent",
    request.agentId,
    "--local",
    "--json",
    "--session-id",
    request.sessionId,
    "--thinking",
    thinking,
    "--timeout",
    String(timeoutSeconds),
    "--message",
    request.message,
  ];
  if (deliver) args.push("--deliver");
  return {
    routingMode,
    command: "openclaw",
    args,
    sessionKey,
  };
}
