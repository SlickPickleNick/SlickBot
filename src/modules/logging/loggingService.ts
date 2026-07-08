import { AttachmentBuilder, EmbedBuilder, type Client, type TextBasedChannel } from "discord.js";
import { AuditSeverity, LogDeliveryMode, type PrismaClient } from "@prisma/client";
import { truncate } from "../../utils/format.js";

type LogInput = {
  guildId: string;
  eventKey: string;
  title: string;
  body: string;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
};

type AuditInput = {
  guildId: string;
  actorUserId?: string | null;
  actionKey: string;
  targetType?: string | null;
  targetId?: string | null;
  severity?: AuditSeverity;
  summary: string;
  metadata?: Record<string, unknown>;
};

export class LoggingService {
  constructor(
    private readonly db: PrismaClient,
    private readonly client: Client
  ) {}

  async writeAudit(input: AuditInput): Promise<void> {
    await this.db.auditLog.create({
      data: {
        guildId: input.guildId,
        actorUserId: input.actorUserId ?? null,
        actionKey: input.actionKey,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        severity: input.severity ?? AuditSeverity.INFO,
        summary: input.summary,
        metadata: input.metadata ?? undefined
      }
    });
  }

  async log(input: LogInput): Promise<void> {
    const setting = await this.db.logSetting.findUnique({
      where: {
        guildId_eventKey: {
          guildId: input.guildId,
          eventKey: input.eventKey
        }
      }
    });

    const deliveryMode = setting?.enabled === false ? LogDeliveryMode.DISABLED : setting?.deliveryMode ?? LogDeliveryMode.BATCHED;

    if (deliveryMode === LogDeliveryMode.DISABLED) return;

    if (deliveryMode === LogDeliveryMode.IMMEDIATE) {
      await this.sendImmediate(input, setting?.channelId ?? null);
      return;
    }

    await this.db.logQueueItem.create({
      data: {
        guildId: input.guildId,
        eventKey: input.eventKey,
        title: input.title,
        body: input.body,
        metadata: input.metadata ?? undefined
      }
    });
  }

  async sendImmediate(input: LogInput, preferredChannelId?: string | null): Promise<void> {
    const channelId = await this.resolveLogChannelId(input.guildId, input.eventKey, preferredChannelId);
    if (!channelId) return;

    const channel = await this.fetchTextChannel(channelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(input.title)
      .setDescription(truncate(input.body, 4000))
      .setFooter({ text: input.eventKey })
      .setTimestamp(new Date());

    await channel.send({ embeds: [embed] });
  }

  async flushDueBatches(): Promise<void> {
    const pendingSettings = await this.db.logSetting.findMany({
      where: {
        enabled: true,
        deliveryMode: LogDeliveryMode.BATCHED
      }
    });

    for (const setting of pendingSettings) {
      await this.flushBatch(setting.guildId, setting.eventKey, setting.maxBatchItems);
    }
  }

  async flushGuildBatches(guildId: string): Promise<number> {
    const eventKeys = await this.db.logQueueItem.findMany({
      where: { guildId, flushedAt: null },
      select: { eventKey: true },
      distinct: ["eventKey"]
    });

    let flushed = 0;
    for (const { eventKey } of eventKeys) {
      flushed += await this.flushBatch(guildId, eventKey, 25);
    }
    return flushed;
  }

  async flushBatch(guildId: string, eventKey: string, take = 25): Promise<number> {
    const queued = await this.db.logQueueItem.findMany({
      where: { guildId, eventKey, flushedAt: null },
      orderBy: { createdAt: "asc" },
      take
    });

    if (queued.length === 0) return 0;

    const channelId = await this.resolveLogChannelId(guildId, eventKey);
    if (!channelId) return 0;

    const channel = await this.fetchTextChannel(channelId);
    if (!channel) return 0;

    const lines = queued.map((item) => {
      const timestamp = item.createdAt.toISOString();
      return `[${timestamp}] ${item.title}\n${item.body}`;
    });

    const body = lines.join("\n\n");
    const summary = lines.slice(0, 10).join("\n\n");

    const embed = new EmbedBuilder()
      .setTitle(`${eventKey} Log Batch`)
      .setDescription(truncate(summary, 3900))
      .setFooter({ text: `${queued.length} log item${queued.length === 1 ? "" : "s"}` })
      .setTimestamp(new Date());

    if (body.length > 3900) {
      const file = new AttachmentBuilder(Buffer.from(body, "utf8"), {
        name: `${eventKey}-${Date.now()}.txt`
      });
      await channel.send({ embeds: [embed], files: [file] });
    } else {
      await channel.send({ embeds: [embed] });
    }

    await this.db.logQueueItem.updateMany({
      where: { id: { in: queued.map((item) => item.id) } },
      data: { flushedAt: new Date() }
    });

    return queued.length;
  }

  private async resolveLogChannelId(guildId: string, eventKey: string, preferredChannelId?: string | null): Promise<string | null> {
    if (preferredChannelId) return preferredChannelId;

    const setting = await this.db.logSetting.findUnique({
      where: {
        guildId_eventKey: {
          guildId,
          eventKey
        }
      }
    });
    if (setting?.channelId) return setting.channelId;

    const guild = await this.db.guildConfig.findUnique({ where: { guildId } });
    return guild?.defaultLogChannelId ?? null;
  }

  private async fetchTextChannel(channelId: string): Promise<TextBasedChannel | null> {
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;
    return channel;
  }
}
