import { EventEmitter } from 'events';
import type { MCPToolResult } from '../types/mcp.types';

export interface ToolExecutionMetrics {
  toolName: string;
  serverId?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: string;
  inputSize: number;
  outputSize?: number;
  metadata?: Record<string, unknown>;
}

export interface ToolUsageStats {
  toolName: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  totalInputSize: number;
  totalOutputSize: number;
  lastExecuted?: Date;
  errorRate: number;
  successRate: number;
}

export interface AggregatedAnalytics {
  totalTools: number;
  totalExecutions: number;
  totalSuccesses: number;
  totalFailures: number;
  overallSuccessRate: number;
  overallErrorRate: number;
  averageExecutionTime: number;
  mostUsedTools: Array<{ name: string; count: number }>;
  slowestTools: Array<{ name: string; avgDuration: number }>;
  failingTools: Array<{ name: string; errorRate: number }>;
  timeSeriesData: TimeSeriesData[];
}

export interface TimeSeriesData {
  timestamp: Date;
  executions: number;
  successes: number;
  failures: number;
  averageDuration: number;
}

export interface AnalyticsConfig {
  maxMetricsRetention?: number;
  aggregationInterval?: number;
  enableRealTimeAnalytics?: boolean;
  persistAnalytics?: boolean;
  storagePath?: string;
}

export class ToolAnalytics extends EventEmitter {
  private metrics: Map<string, ToolExecutionMetrics[]> = new Map();
  private aggregatedStats: Map<string, ToolUsageStats> = new Map();
  private timeSeriesData: TimeSeriesData[] = [];
  private config: Required<AnalyticsConfig>;
  private aggregationTimer?: NodeJS.Timeout;

  constructor(config: AnalyticsConfig = {}) {
    super();
    this.config = {
      maxMetricsRetention: config.maxMetricsRetention ?? 10000,
      aggregationInterval: config.aggregationInterval ?? 60000,
      enableRealTimeAnalytics: config.enableRealTimeAnalytics ?? true,
      persistAnalytics: config.persistAnalytics ?? false,
      storagePath: config.storagePath ?? './analytics',
    };

    if (this.config.enableRealTimeAnalytics) {
      this.startAggregation();
    }
  }

  recordExecutionStart(
    toolName: string,
    args?: Record<string, unknown>,
    serverId?: string
  ): string {
    const executionId = this.generateExecutionId();
    const inputSize = args ? JSON.stringify(args).length : 0;

    const metric: ToolExecutionMetrics = {
      toolName,
      serverId,
      startTime: Date.now(),
      success: false,
      inputSize,
    };

    if (!this.metrics.has(executionId)) {
      this.metrics.set(executionId, []);
    }

    const toolMetrics = this.metrics.get(toolName) || [];
    toolMetrics.push(metric);
    this.metrics.set(toolName, toolMetrics);

    this.emit('executionStarted', { executionId, toolName, serverId });

    return executionId;
  }

  recordExecutionEnd(
    executionId: string,
    toolName: string,
    result?: MCPToolResult,
    error?: Error
  ): void {
    const toolMetrics = this.metrics.get(toolName);
    if (!toolMetrics) return;

    const metric = toolMetrics[toolMetrics.length - 1];
    if (!metric) return;

    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.success = !error && !result?.isError;
    metric.error = error?.message || (result?.isError ? 'Tool returned error' : undefined);

    if (result?.content) {
      metric.outputSize = JSON.stringify(result.content).length;
    }

    this.updateAggregatedStats(toolName, metric);
    this.trimMetrics(toolName);

    this.emit('executionCompleted', {
      executionId,
      toolName,
      duration: metric.duration,
      success: metric.success,
    });

    if (!metric.success) {
      this.emit('executionFailed', {
        executionId,
        toolName,
        error: metric.error,
      });
    }
  }

  private updateAggregatedStats(toolName: string, metric: ToolExecutionMetrics): void {
    let stats = this.aggregatedStats.get(toolName);

    if (!stats) {
      stats = {
        toolName,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        totalInputSize: 0,
        totalOutputSize: 0,
        errorRate: 0,
        successRate: 0,
      };
      this.aggregatedStats.set(toolName, stats);
    }

    stats.totalExecutions++;

    if (metric.success) {
      stats.successfulExecutions++;
    } else {
      stats.failedExecutions++;
    }

    if (metric.duration) {
      const totalDuration = stats.averageDuration * (stats.totalExecutions - 1) + metric.duration;
      stats.averageDuration = totalDuration / stats.totalExecutions;
      stats.minDuration = Math.min(stats.minDuration, metric.duration);
      stats.maxDuration = Math.max(stats.maxDuration, metric.duration);
    }

    stats.totalInputSize += metric.inputSize;
    stats.totalOutputSize += metric.outputSize || 0;
    stats.lastExecuted = new Date();

    stats.successRate =
      stats.totalExecutions > 0 ? stats.successfulExecutions / stats.totalExecutions : 0;
    stats.errorRate =
      stats.totalExecutions > 0 ? stats.failedExecutions / stats.totalExecutions : 0;
  }

  getToolStats(toolName: string): ToolUsageStats | undefined {
    return this.aggregatedStats.get(toolName);
  }

  getAllToolStats(): ToolUsageStats[] {
    return Array.from(this.aggregatedStats.values());
  }

  getAggregatedAnalytics(): AggregatedAnalytics {
    const allStats = this.getAllToolStats();

    const totalExecutions = allStats.reduce((sum, s) => sum + s.totalExecutions, 0);
    const totalSuccesses = allStats.reduce((sum, s) => sum + s.successfulExecutions, 0);
    const totalFailures = allStats.reduce((sum, s) => sum + s.failedExecutions, 0);

    const mostUsedTools = allStats
      .sort((a, b) => b.totalExecutions - a.totalExecutions)
      .slice(0, 10)
      .map((s) => ({ name: s.toolName, count: s.totalExecutions }));

    const slowestTools = allStats
      .filter((s) => s.averageDuration > 0)
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, 10)
      .map((s) => ({ name: s.toolName, avgDuration: s.averageDuration }));

    const failingTools = allStats
      .filter((s) => s.errorRate > 0)
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, 10)
      .map((s) => ({ name: s.toolName, errorRate: s.errorRate }));

    const totalDuration = allStats.reduce(
      (sum, s) => sum + s.averageDuration * s.totalExecutions,
      0
    );

    return {
      totalTools: allStats.length,
      totalExecutions,
      totalSuccesses,
      totalFailures,
      overallSuccessRate: totalExecutions > 0 ? totalSuccesses / totalExecutions : 0,
      overallErrorRate: totalExecutions > 0 ? totalFailures / totalExecutions : 0,
      averageExecutionTime: totalExecutions > 0 ? totalDuration / totalExecutions : 0,
      mostUsedTools,
      slowestTools,
      failingTools,
      timeSeriesData: this.timeSeriesData.slice(-100),
    };
  }

  getToolExecutionHistory(toolName: string, limit = 100): ToolExecutionMetrics[] {
    const metrics = this.metrics.get(toolName) || [];
    return metrics.slice(-limit);
  }

  getRecentExecutions(limit = 100): ToolExecutionMetrics[] {
    const allMetrics: ToolExecutionMetrics[] = [];

    for (const metrics of this.metrics.values()) {
      allMetrics.push(...metrics);
    }

    return allMetrics.sort((a, b) => b.startTime - a.startTime).slice(0, limit);
  }

  generateReport(
    options: {
      startDate?: Date;
      endDate?: Date;
      toolNames?: string[];
      format?: 'json' | 'csv' | 'html';
    } = {}
  ): string {
    const stats = this.getAllToolStats().filter((s) => {
      if (options.toolNames && !options.toolNames.includes(s.toolName)) {
        return false;
      }

      if (options.startDate || options.endDate) {
        const lastExecuted = s.lastExecuted?.getTime() || 0;

        if (options.startDate && lastExecuted < options.startDate.getTime()) {
          return false;
        }

        if (options.endDate && lastExecuted > options.endDate.getTime()) {
          return false;
        }
      }

      return true;
    });

    switch (options.format) {
      case 'csv':
        return this.generateCSVReport(stats);
      case 'html':
        return this.generateHTMLReport(stats);
      default:
        return JSON.stringify(stats, null, 2);
    }
  }

  private generateCSVReport(stats: ToolUsageStats[]): string {
    const headers = [
      'Tool Name',
      'Total Executions',
      'Successful',
      'Failed',
      'Success Rate',
      'Error Rate',
      'Avg Duration (ms)',
      'Min Duration (ms)',
      'Max Duration (ms)',
      'Last Executed',
    ];

    const rows = stats.map((s) => [
      s.toolName,
      s.totalExecutions,
      s.successfulExecutions,
      s.failedExecutions,
      (s.successRate * 100).toFixed(2) + '%',
      (s.errorRate * 100).toFixed(2) + '%',
      s.averageDuration.toFixed(2),
      s.minDuration === Infinity ? 'N/A' : s.minDuration.toFixed(2),
      s.maxDuration.toFixed(2),
      s.lastExecuted?.toISOString() || 'Never',
    ]);

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }

  private generateHTMLReport(stats: ToolUsageStats[]): string {
    const tableRows = stats
      .map(
        (s) => `
      <tr>
        <td>${s.toolName}</td>
        <td>${s.totalExecutions}</td>
        <td>${s.successfulExecutions}</td>
        <td>${s.failedExecutions}</td>
        <td>${(s.successRate * 100).toFixed(2)}%</td>
        <td>${(s.errorRate * 100).toFixed(2)}%</td>
        <td>${s.averageDuration.toFixed(2)}ms</td>
        <td>${s.lastExecuted?.toISOString() || 'Never'}</td>
      </tr>
    `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Tool Analytics Report</title>
        <style>
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #4CAF50; color: white; }
          tr:nth-child(even) { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h1>Tool Analytics Report</h1>
        <table>
          <thead>
            <tr>
              <th>Tool Name</th>
              <th>Total Executions</th>
              <th>Successful</th>
              <th>Failed</th>
              <th>Success Rate</th>
              <th>Error Rate</th>
              <th>Avg Duration</th>
              <th>Last Executed</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </body>
      </html>
    `;
  }

  private startAggregation(): void {
    this.aggregationTimer = setInterval(() => {
      this.aggregateTimeSeriesData();
    }, this.config.aggregationInterval);
  }

  private aggregateTimeSeriesData(): void {
    const now = new Date();
    let executions = 0;
    let successes = 0;
    let failures = 0;
    let totalDuration = 0;
    let durationCount = 0;

    for (const stats of this.aggregatedStats.values()) {
      executions += stats.totalExecutions;
      successes += stats.successfulExecutions;
      failures += stats.failedExecutions;

      if (stats.averageDuration > 0) {
        totalDuration += stats.averageDuration * stats.totalExecutions;
        durationCount += stats.totalExecutions;
      }
    }

    const dataPoint: TimeSeriesData = {
      timestamp: now,
      executions,
      successes,
      failures,
      averageDuration: durationCount > 0 ? totalDuration / durationCount : 0,
    };

    this.timeSeriesData.push(dataPoint);

    if (this.timeSeriesData.length > 1000) {
      this.timeSeriesData.shift();
    }

    this.emit('timeSeriesUpdated', dataPoint);
  }

  private trimMetrics(toolName: string): void {
    const metrics = this.metrics.get(toolName);
    if (!metrics) return;

    if (metrics.length > this.config.maxMetricsRetention) {
      const toRemove = metrics.length - this.config.maxMetricsRetention;
      metrics.splice(0, toRemove);
    }
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  reset(): void {
    this.metrics.clear();
    this.aggregatedStats.clear();
    this.timeSeriesData = [];
    this.emit('analyticsReset');
  }

  destroy(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = undefined;
    }

    this.removeAllListeners();
  }
}
