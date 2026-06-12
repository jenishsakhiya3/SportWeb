import { Component, inject, OnInit, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, finalize, of, Observable } from 'rxjs';

interface ApiCall {
  id: number;
  label: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  payload?: any;
  delayMs: number;
  description: string;
  status?: number;
  statusText?: string;
  duration?: number;
  responseBody?: any;
  loading: boolean;
  expanded: boolean;
}

interface LogLine {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warn';
  message: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="console-container animate-fade-in">
      <!-- Top Status Header -->
      <header class="console-header">
        <div class="title-area">
          <h1 class="console-title">SportAPI Developer Hub</h1>
          <p class="console-subtitle">Integration testing sandbox & client runner</p>
        </div>

        <div class="server-status" [class.online]="isServerOnline()" [class.offline]="!isServerOnline()">
          <span class="pulse-dot"></span>
          <span class="status-text">
            API SERVER: {{ isServerOnline() ? 'ONLINE (' + (apiBaseUrl() || 'localhost:5135') + ')' : 'OFFLINE (' + (apiBaseUrl() || 'localhost:5135') + ')' }}
          </span>
        </div>
      </header>

      <!-- Offline Helper Warning -->
      <div class="warning-banner" *ngIf="!isServerOnline()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="warning-icon">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div class="warning-content">
          <strong>Backend Offline:</strong> To run live integration requests, launch your backend API.
          <div *ngIf="!apiBaseUrl()">
            <span class="instruction-text" style="font-size: 0.85rem; color: var(--text-secondary);">Make sure your local server is running on port 5135:</span>
            <pre class="code-line">cd d:\\SPORT\\SportAPI ; dotnet run</pre>
          </div>
          <div *ngIf="apiBaseUrl()" style="margin-top: 6px;">
            <span class="instruction-text" style="font-size: 0.85rem; color: var(--text-secondary);">Verify that your hosted server at <code>{{ apiBaseUrl() }}</code> is active and CORS is enabled.</span>
          </div>
        </div>
        <button class="btn-check-server" (click)="pingServer()" [disabled]="checkingServer()">
          {{ checkingServer() ? 'Probing...' : 'Re-check Connection' }}
        </button>
      </div>

      <!-- Test Control Panel -->
      <section class="control-panel">
        <div class="suite-info">
          <div class="suite-stat">
            <span class="lbl">TOTAL ENDPOINTS</span>
            <span class="val">{{ apiCalls().length }}</span>
          </div>
          <div class="suite-stat">
            <span class="lbl">SUCCESSFUL</span>
            <span class="val text-success">{{ successCount() }}</span>
          </div>
          <div class="suite-stat">
            <span class="lbl">FAILED</span>
            <span class="val text-error">{{ failureCount() }}</span>
          </div>
          <div class="suite-stat">
            <span class="lbl">AVG LATENCY</span>
            <span class="val text-accent">{{ avgLatency() }}ms</span>
          </div>
        </div>

        <div class="suite-actions">
          <button class="btn-terminal-clear" (click)="clearLogs()">Clear Terminal</button>
          <button class="btn-terminal-run" (click)="runTestSuite()" [disabled]="suiteRunning() || !isServerOnline()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="action-icon">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
            {{ suiteRunning() ? 'Running Suite...' : 'Run Test Suite' }}
          </button>
        </div>
      </section>

      <!-- Suite Progress Bar (Monospaced Text Style) -->
      <div class="suite-progress-container" *ngIf="suiteRunning() || progressPercent() > 0">
        <div class="progress-ascii">
          <span class="progress-percent">TESTING COMPLETED: {{ progressPercent() }}%</span>
          <pre class="ascii-bar">{{ getAsciiProgressBar() }}</pre>
        </div>
      </div>

      <!-- Main Columns Layout -->
      <div class="console-main-grid">
        
        <!-- Left Column: Endpoints list -->
        <div class="endpoints-list-panel">
          <div class="panel-header">
            <h2>Endpoints Configuration</h2>
            <span class="count">{{ apiCalls().length }} endpoints defined</span>
          </div>

          <div class="endpoints-container">
            <div 
              class="endpoint-row" 
              *ngFor="let call of apiCalls()" 
              [class.active-loading]="call.loading"
              [class.expanded]="call.expanded">
              
              <div class="row-summary" (click)="toggleExpand(call)">
                <span class="api-label">#{{ call.id }}</span>
                <span class="http-method-badge" [class]="call.method.toLowerCase()">
                  {{ call.method }}
                </span>
                <span class="endpoint-path">{{ call.endpoint }}</span>
                
                <span class="api-name">{{ call.name }}</span>
                
                <div class="row-status">
                  <span class="loader-dot" *ngIf="call.loading"></span>
                  <span 
                    class="status-pill" 
                    *ngIf="call.status && !call.loading"
                    [class.success]="call.status >= 200 && call.status < 300"
                    [class.error]="call.status >= 400 || call.status === 0">
                    {{ call.status === 0 ? 'ERR' : call.status }} {{ call.statusText }}
                  </span>
                  <span class="latency-lbl" *ngIf="call.duration && !call.loading">
                    {{ call.duration }}ms
                  </span>
                </div>

                <button class="btn-send-call" (click)="runSingleCall(call, $event)" [disabled]="suiteRunning() || call.loading">
                  {{ call.loading ? '...' : 'Send' }}
                </button>
              </div>

              <!-- Expanded Request/Response details -->
              <div class="row-details" *ngIf="call.expanded">
                <div class="details-section">
                  <h4>Request Info</h4>
                  <div class="details-meta">
                    <strong>URL:</strong> <code>http://localhost:5135{{ call.endpoint }}</code><br>
                    <strong>Database Delay:</strong> <code>{{ call.delayMs }}ms</code>
                  </div>
                  <div class="code-block" *ngIf="call.payload">
                    <div class="code-title">Payload (JSON)</div>
                    <pre><code>{{ stringify(call.payload) }}</code></pre>
                  </div>
                </div>

                <div class="details-section" *ngIf="call.responseBody || call.status !== undefined">
                  <h4>Response Info</h4>
                  <div class="details-meta">
                    <strong>HTTP Status:</strong> 
                    <span [class.text-success]="call.status && call.status >= 200 && call.status < 300"
                          [class.text-error]="call.status && (call.status >= 400 || call.status === 0)">
                      {{ call.status }} {{ call.statusText }}
                    </span><br>
                    <strong>Execution Time:</strong> <code>{{ call.duration || 0 }}ms</code>
                  </div>
                  <div class="code-block" *ngIf="call.responseBody">
                    <div class="code-title">Response Body</div>
                    <pre><code>{{ stringify(call.responseBody) }}</code></pre>
                  </div>
                  <div class="empty-response-text" *ngIf="!call.responseBody && call.status !== 0">
                    (No response body returned - standard for PUT/DELETE operations)
                  </div>
                  <div class="empty-response-text text-error" *ngIf="call.status === 0">
                    Connection failed. Make sure server is running and proxy handles the endpoint.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column: Scrolling log terminal -->
        <div class="terminal-panel">
          <div class="terminal-bar">
            <div class="terminal-dots">
              <span class="dot red"></span>
              <span class="dot yellow"></span>
              <span class="dot green"></span>
            </div>
            <span class="terminal-title">guest&#64;sportconsole:~/logs</span>
          </div>

          <div class="terminal-body" #terminalBody>
            <div class="log-row" *ngFor="let log of terminalLogs()">
              <span class="log-time">[{{ log.timestamp }}]</span>
              <span class="log-type" [class]="log.type">
                {{ log.type === 'info' ? 'INFO' : log.type === 'warn' ? 'WARN' : log.type === 'error' ? 'FAIL' : 'OK' }}
              </span>
              <span class="log-message" [innerHTML]="log.message"></span>
            </div>
            <div class="empty-terminal-text" *ngIf="terminalLogs().length === 0">
              Terminal idle. Click "Run Test Suite" or trigger individual endpoints to view transactions...
            </div>
          </div>
        </div>

      </div>
  `,
  styles: [`
    .console-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
      font-family: 'Inter', sans-serif;
      color: #e2e8f0;
      max-width: 1600px;
      margin: 0 auto;
    }

    /* Override variables locally for deep developer theme */
    :host {
      --terminal-bg: #0b0f17;
      --card-bg: #111827;
      --border-flat: #2d3748;
      --accent-green: #10b981;
      --accent-blue: #3b82f6;
      --accent-yellow: #f59e0b;
      --accent-red: #ef4444;
      --font-mono: 'Fira Code', 'Courier New', monospace;
    }

    .console-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-flat);
    }

    .console-title {
      font-size: 1.8rem;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #f8fafc;
    }

    .console-subtitle {
      color: #94a3b8;
      font-size: 0.95rem;
      margin-top: 2px;
    }

    /* Server Status Badge */
    .server-status {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: 1px solid transparent;
    }

    .server-status.online {
      background: rgba(16, 185, 129, 0.08);
      color: var(--accent-green);
      border-color: rgba(16, 185, 129, 0.2);
    }

    .server-status.offline {
      background: rgba(239, 68, 68, 0.08);
      color: var(--accent-red);
      border-color: rgba(239, 68, 68, 0.2);
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: currentColor;
    }

    .online .pulse-dot {
      box-shadow: 0 0 10px var(--accent-green);
      animation: pulseGlow 1.5s infinite;
    }

    .offline .pulse-dot {
      box-shadow: 0 0 10px var(--accent-red);
      animation: pulseGlow 1s infinite;
    }

    /* Warning banner */
    .warning-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 16px 20px;
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-radius: 8px;
      color: #fbcfe8;
      flex-wrap: wrap;
    }

    .warning-icon {
      width: 28px;
      height: 28px;
      color: var(--accent-yellow);
      flex-shrink: 0;
    }

    .warning-content {
      flex: 1;
      font-size: 0.95rem;
      line-height: 1.5;
    }

    .code-line {
      display: block;
      margin-top: 6px;
      background: #000;
      color: #38bdf8;
      padding: 6px 12px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      border: 1px solid #1e293b;
    }

    .btn-check-server {
      background: var(--accent-yellow);
      color: #000;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-weight: 700;
      cursor: pointer;
      font-size: 0.85rem;
      transition: opacity 0.2s;
    }

    .btn-check-server:hover {
      opacity: 0.9;
    }

    /* Control Panel */
    .control-panel {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--card-bg);
      border: 1px solid var(--border-flat);
      padding: 16px 24px;
      border-radius: 8px;
      flex-wrap: wrap;
      gap: 20px;
    }

    .suite-info {
      display: flex;
      gap: 32px;
      flex-wrap: wrap;
    }

    .suite-stat {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .suite-stat .lbl {
      font-size: 0.75rem;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 1px;
    }

    .suite-stat .val {
      font-size: 1.5rem;
      font-weight: 800;
      font-family: var(--font-mono);
    }

    .text-success { color: var(--accent-green); }
    .text-error { color: var(--accent-red); }
    .text-accent { color: var(--accent-blue); }

    .suite-actions {
      display: flex;
      gap: 12px;
    }

    .btn-terminal-clear {
      background: transparent;
      border: 1px solid var(--border-flat);
      color: #94a3b8;
      padding: 10px 18px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-terminal-clear:hover {
      background: #1e293b;
      color: #f1f5f9;
    }

    .btn-terminal-run {
      background: var(--accent-green);
      color: #0b0f17;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 0.9rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
    }

    .btn-terminal-run:hover:not(:disabled) {
      box-shadow: 0 0 15px rgba(16, 185, 129, 0.4);
      transform: translateY(-1px);
    }

    .btn-terminal-run:disabled {
      background: #334155;
      color: #64748b;
      cursor: not-allowed;
    }

    .action-icon {
      width: 16px;
      height: 16px;
    }

    /* Progress bar */
    .suite-progress-container {
      background: var(--card-bg);
      border: 1px solid var(--border-flat);
      border-top: none;
      padding: 14px 24px;
      margin-top: -24px;
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
    }

    .progress-ascii {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .progress-percent {
      font-family: var(--font-mono);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--accent-green);
    }

    .ascii-bar {
      margin: 0;
      font-family: var(--font-mono);
      color: #64748b;
      font-size: 0.9rem;
      white-space: pre-wrap;
    }

    /* Grid layout */
    .console-main-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 24px;
      align-items: start;
    }

    @media (max-width: 1200px) {
      .console-main-grid {
        grid-template-columns: 1fr;
      }
    }

    /* Left Endpoints List */
    .endpoints-list-panel {
      background: var(--card-bg);
      border: 1px solid var(--border-flat);
      border-radius: 8px;
      overflow: hidden;
    }

    .panel-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-flat);
      background: rgba(255,255,255,0.01);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .panel-header h2 {
      font-size: 1.1rem;
      font-weight: 700;
      color: #f1f5f9;
    }

    .panel-header .count {
      font-size: 0.8rem;
      color: #64748b;
      font-family: var(--font-mono);
    }

    .endpoints-container {
      display: flex;
      flex-direction: column;
    }

    .endpoint-row {
      border-bottom: 1px solid var(--border-flat);
      transition: background-color 0.2s;
    }

    .endpoint-row:last-child {
      border-bottom: none;
    }

    .endpoint-row:hover {
      background: rgba(255, 255, 255, 0.015);
    }

    .row-summary {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      gap: 12px;
      cursor: pointer;
      user-select: none;
    }

    .api-label {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      color: #475569;
      width: 28px;
      flex-shrink: 0;
    }

    .http-method-badge {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      width: 62px;
      text-align: center;
      flex-shrink: 0;
    }

    .http-method-badge.get {
      background: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
      border: 1px solid rgba(59, 130, 246, 0.2);
    }

    .http-method-badge.post {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .http-method-badge.put {
      background: rgba(245, 158, 11, 0.1);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.2);
    }

    .http-method-badge.delete {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.2);
    }

    .endpoint-path {
      font-family: var(--font-mono);
      font-size: 0.85rem;
      color: #e2e8f0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1.2;
    }

    .api-name {
      font-size: 0.85rem;
      color: #94a3b8;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .row-status {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: auto;
      flex-shrink: 0;
    }

    .loader-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-blue);
      animation: pulseGlow 0.8s infinite;
    }

    .status-pill {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .status-pill.success {
      background: rgba(16, 185, 129, 0.1);
      color: var(--accent-green);
    }

    .status-pill.error {
      background: rgba(239, 68, 68, 0.1);
      color: var(--accent-red);
    }

    .latency-lbl {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      color: #64748b;
    }

    .btn-send-call {
      background: transparent;
      border: 1px solid var(--border-flat);
      color: #cbd5e1;
      font-size: 0.8rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-send-call:hover:not(:disabled) {
      background: #1e293b;
      border-color: #475569;
    }

    /* Expand Section */
    .row-details {
      padding: 16px 20px 20px 20px;
      background: rgba(0, 0, 0, 0.15);
      border-top: 1px dashed var(--border-flat);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .details-section h4 {
      font-size: 0.8rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .details-meta {
      font-size: 0.85rem;
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 8px;
    }

    .details-meta code {
      font-family: var(--font-mono);
      color: #e2e8f0;
      background: #000;
      padding: 2px 6px;
      border-radius: 3px;
    }

    .code-block {
      border: 1px solid var(--border-flat);
      border-radius: 6px;
      background: #090d16;
      overflow: hidden;
    }

    .code-title {
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid var(--border-flat);
      padding: 6px 12px;
      font-size: 0.75rem;
      font-weight: 600;
      color: #64748b;
      font-family: var(--font-mono);
    }

    .code-block pre {
      margin: 0;
      padding: 12px;
      overflow-x: auto;
    }

    .code-block code {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      color: #38bdf8;
    }

    .empty-response-text {
      font-size: 0.8rem;
      color: #64748b;
      font-style: italic;
    }

    /* Right Column Terminal */
    .terminal-panel {
      background: var(--terminal-bg);
      border: 1px solid var(--border-flat);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
      position: sticky;
      top: 24px;
    }

    .terminal-bar {
      background: #111827;
      border-bottom: 1px solid var(--border-flat);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .terminal-dots {
      display: flex;
      gap: 6px;
    }

    .terminal-dots .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .terminal-dots .dot.red { background: #ef4444; }
    .terminal-dots .dot.yellow { background: #f59e0b; }
    .terminal-dots .dot.green { background: #10b981; }

    .terminal-title {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      color: #64748b;
    }

    .terminal-body {
      padding: 16px;
      height: 480px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .log-row {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      line-height: 1.5;
      display: flex;
      gap: 8px;
      word-break: break-all;
    }

    .log-time {
      color: #475569;
      flex-shrink: 0;
    }

    .log-type {
      font-weight: 700;
      width: 38px;
      text-align: center;
      flex-shrink: 0;
    }

    .log-type.info { color: #3b82f6; }
    .log-type.success { color: #10b981; }
    .log-type.error { color: #ef4444; }
    .log-type.warn { color: #f59e0b; }

    .log-message {
      color: #cbd5e1;
    }

    .empty-terminal-text {
      font-family: var(--font-mono);
      font-size: 0.8rem;
      color: #475569;
      text-align: center;
      margin: auto 0;
      padding: 0 40px;
      line-height: 1.6;
    }

    @keyframes pulseGlow {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }
  `]
})
export class DashboardComponent implements OnInit {
  private http = inject(HttpClient);

  // Set this to your hosted API URL (e.g. 'https://my-api-domain.com') to target a hosted API.
  // Leave empty '' to use the dev server proxy config (localhost:5135).
  readonly apiBaseUrl = signal<string>('https://sportapi-fsadb5hrbzhef6en.eastasia-01.azurewebsites.net');

  // Endpoint Definitions
  readonly apiCalls = signal<ApiCall[]>([
    {
      id: 1,
      label: '0',
      name: 'GET Weather Forecast',
      method: 'GET',
      endpoint: '/weatherforecast',
      delayMs: 20,
      description: 'Quick connectivity check (default endpoint)',
      loading: false,
      expanded: false
    },
    {
      id: 2,
      label: '1',
      name: 'GET Sports',
      method: 'GET',
      endpoint: '/api/sports',
      delayMs: 50,
      description: 'Retrieve all sports from the database',
      loading: false,
      expanded: false
    },
    {
      id: 3,
      label: '2',
      name: 'POST Sports',
      method: 'POST',
      endpoint: '/api/sports',
      payload: { name: 'Athletics' },
      delayMs: 100,
      description: 'Insert new sport (Athletics) into database',
      loading: false,
      expanded: false
    },
    {
      id: 4,
      label: '3',
      name: 'GET Teams',
      method: 'GET',
      endpoint: '/api/teams',
      delayMs: 150,
      description: 'Retrieve all team entries',
      loading: false,
      expanded: false
    },
    {
      id: 5,
      label: '3b',
      name: 'GET Teams by SportId',
      method: 'GET',
      endpoint: '/api/teams?sportId=1',
      delayMs: 150,
      description: 'Retrieve teams linked to Sport ID 1',
      loading: false,
      expanded: false
    },
    {
      id: 6,
      label: '4',
      name: 'POST Teams',
      method: 'POST',
      endpoint: '/api/teams',
      payload: {
        name: 'Liverpool F.C.',
        city: 'Liverpool',
        sportId: 1
      },
      delayMs: 200,
      description: 'Insert new team in league',
      loading: false,
      expanded: false
    },
    {
      id: 7,
      label: '5',
      name: 'GET Players',
      method: 'GET',
      endpoint: '/api/players',
      delayMs: 250,
      description: 'Retrieve all players in system',
      loading: false,
      expanded: false
    },
    {
      id: 8,
      label: '5b',
      name: 'GET Players by TeamId',
      method: 'GET',
      endpoint: '/api/players?teamId=1',
      delayMs: 250,
      description: 'Filter players by Team ID 1',
      loading: false,
      expanded: false
    },
    {
      id: 9,
      label: '6',
      name: 'POST Players',
      method: 'POST',
      endpoint: '/api/players',
      payload: {
        name: 'Jude Bellingham',
        age: 20,
        position: 'Midfielder',
        teamId: 1
      },
      delayMs: 300,
      description: 'Register a new player profile',
      loading: false,
      expanded: false
    },
    {
      id: 10,
      label: '7',
      name: 'PUT Players',
      method: 'PUT',
      endpoint: '/api/players/1',
      payload: {
        name: 'Luka Modrić',
        age: 39,
        position: 'Midfielder (Captain)',
        teamId: 1
      },
      delayMs: 350,
      description: 'Update metadata for Player ID 1',
      loading: false,
      expanded: false
    },
    {
      id: 11,
      label: '8',
      name: 'DELETE Players',
      method: 'DELETE',
      endpoint: '/api/players/3',
      delayMs: 400,
      description: 'Remove Player ID 3',
      loading: false,
      expanded: false
    },
    {
      id: 12,
      label: '9',
      name: 'GET Matches',
      method: 'GET',
      endpoint: '/api/matches',
      delayMs: 450,
      description: 'Get list of sport matches',
      loading: false,
      expanded: false
    },
    {
      id: 13,
      label: '10',
      name: 'POST Matches',
      method: 'POST',
      endpoint: '/api/matches',
      payload: {
        matchDate: '2026-06-15T20:00:00Z',
        sportId: 1,
        homeTeamId: 1,
        awayTeamId: 2,
        homeScore: 0,
        awayScore: 0,
        status: 'Scheduled'
      },
      delayMs: 500,
      description: 'Log new sports match fixture',
      loading: false,
      expanded: false
    },
    {
      id: 14,
      label: '11',
      name: 'PUT Matches Score',
      method: 'PUT',
      endpoint: '/api/matches/1/score',
      payload: {
        homeScore: 2,
        awayScore: 1,
        status: 'Finished'
      },
      delayMs: 550,
      description: 'Set scores for Match ID 1',
      loading: false,
      expanded: false
    },
    {
      id: 15,
      label: '12',
      name: 'GET Matches Stats',
      method: 'GET',
      endpoint: '/api/matches/1/stats',
      delayMs: 600,
      description: 'Get statistics for Match ID 1',
      loading: false,
      expanded: false
    },
    {
      id: 16,
      label: '13',
      name: 'POST Matches Stats',
      method: 'POST',
      endpoint: '/api/matches/1/stats',
      payload: {
        possessionHome: 55,
        possessionAway: 45,
        shotsHome: 12,
        shotsAway: 8
      },
      delayMs: 650,
      description: 'Upsert match logs/stats on match 1',
      loading: false,
      expanded: false
    },
    {
      id: 17,
      label: '14',
      name: 'GET Leagues',
      method: 'GET',
      endpoint: '/api/leagues',
      delayMs: 700,
      description: 'Retrieve sport league organizations',
      loading: false,
      expanded: false
    },
    {
      id: 18,
      label: '15',
      name: 'POST Leagues',
      method: 'POST',
      endpoint: '/api/leagues',
      payload: {
        name: 'Serie A',
        country: 'Italy'
      },
      delayMs: 750,
      description: 'Add new League (Serie A)',
      loading: false,
      expanded: false
    },
    {
      id: 19,
      label: '16',
      name: 'GET Standings',
      method: 'GET',
      endpoint: '/api/standings/1',
      delayMs: 800,
      description: 'Get league table rankings for League 1',
      loading: false,
      expanded: false
    },
    {
      id: 20,
      label: '17',
      name: 'GET Coaches',
      method: 'GET',
      endpoint: '/api/coaches',
      delayMs: 850,
      description: 'Retrieve registered trainers/coaches',
      loading: false,
      expanded: false
    },
    {
      id: 21,
      label: '18',
      name: 'POST Coaches',
      method: 'POST',
      endpoint: '/api/coaches',
      payload: {
        name: 'Arne Slot',
        teamId: 2,
        experienceYears: 10
      },
      delayMs: 900,
      description: 'Register coach Arne Slot to team 2',
      loading: false,
      expanded: false
    },
    {
      id: 22,
      label: '19',
      name: 'POST Transfer Player',
      method: 'POST',
      endpoint: '/api/players/2/transfer',
      payload: {
        toTeamId: 1,
        transferFee: 150000000.00
      },
      delayMs: 950,
      description: 'Transfer player 2 to team 1',
      loading: false,
      expanded: false
    },
    {
      id: 23,
      label: '20',
      name: 'GET Dashboard Summary',
      method: 'GET',
      endpoint: '/api/dashboard/summary',
      delayMs: 1000,
      description: 'Fetch counts summary of sports data objects',
      loading: false,
      expanded: false
    }
  ]);

  // Terminal Logs State
  readonly terminalLogs = signal<LogLine[]>([]);

  // Server Online State
  readonly isServerOnline = signal<boolean>(false);
  readonly checkingServer = signal<boolean>(false);

  // Batch Suite Running State
  readonly suiteRunning = signal<boolean>(false);
  readonly progressPercent = signal<number>(0);

  // Computations
  readonly successCount = computed(() => 
    this.apiCalls().filter(c => c.status !== undefined && c.status >= 200 && c.status < 300).length
  );
  
  readonly failureCount = computed(() => 
    this.apiCalls().filter(c => c.status !== undefined && (c.status >= 400 || c.status === 0)).length
  );

  readonly avgLatency = computed(() => {
    const list = this.apiCalls().filter(c => c.duration !== undefined);
    if (list.length === 0) return 0;
    const total = list.reduce((sum, c) => sum + (c.duration || 0), 0);
    return Math.round(total / list.length);
  });

  @ViewChild('terminalBody') private terminalBody!: ElementRef;

  ngOnInit() {
    this.pingServer();
  }

  // Probe server connectivity
  pingServer() {
    const targetHost = this.apiBaseUrl() || 'http://localhost:5135';
    this.checkingServer.set(true);
    this.addLog('info', `Probing server connection at ${targetHost}...`);
    
    this.http.get(this.apiBaseUrl() + '/sports')
      .pipe(
        catchError(() => {
          return of(null);
        }),
        finalize(() => this.checkingServer.set(false))
      )
      .subscribe((res) => {
        if (res) {
          this.isServerOnline.set(true);
          this.addLog('success', 'Connection established. C# backend server is ONLINE.');
        } else {
          this.isServerOnline.set(false);
          this.addLog('error', 'Connection failed. C# server is OFFLINE. CORS or host mismatch.');
        }
      });
  }

  // Toggle expanded details panel
  toggleExpand(call: ApiCall) {
    this.apiCalls.update(list => list.map(c => 
      c.id === call.id ? { ...c, expanded: !c.expanded } : c
    ));
  }

  // Execute a single endpoint call
  runSingleCall(call: ApiCall, event?: Event) {
    if (event) {
      event.stopPropagation(); // Avoid triggering parent toggleExpand
    }

    this.apiCalls.update(list => list.map(c => 
      c.id === call.id ? { ...c, loading: true, status: undefined, statusText: undefined, duration: undefined } : c
    ));

    this.addLog('info', `Firing request: <strong style="color:var(--accent-blue)">${call.method}</strong> ${call.endpoint}`);

    const startTime = performance.now();
    let requestObservable: Observable<any>;

    const url = this.apiBaseUrl() + call.endpoint;
    if (call.method === 'GET') {
      requestObservable = this.http.get(url);
    } else if (call.method === 'POST') {
      requestObservable = this.http.post(url, call.payload);
    } else if (call.method === 'PUT') {
      requestObservable = this.http.put(url, call.payload);
    } else if (call.method === 'DELETE') {
      requestObservable = this.http.delete(url);
    } else {
      requestObservable = of(null);
    }

    requestObservable
      .pipe(
        catchError((err: HttpErrorResponse) => {
          return of(err);
        }),
        finalize(() => {
          this.apiCalls.update(list => list.map(c => 
            c.id === call.id ? { ...c, loading: false } : c
          ));
          this.scrollToBottom();
        })
      )
      .subscribe((response) => {
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);

        let status = 200;
        let statusText = 'OK';
        let responseBody: any = response;

        if (response instanceof HttpErrorResponse) {
          status = response.status;
          statusText = response.statusText || 'Error';
          responseBody = response.error || null;
          
          this.addLog('error', `Request failed: <strong style="color:var(--accent-red)">${call.method}</strong> ${call.endpoint} -> ${status} ${statusText} (${duration}ms)`);
        } else {
          // Angular defaults POST to 201 Created or 200 depending on output
          if (call.method === 'POST') {
            status = 201;
            statusText = 'Created';
          } else if (call.method === 'PUT' || call.method === 'DELETE') {
            status = 204;
            statusText = 'No Content';
          }
          
          this.addLog('success', `Request completed: <strong style="color:var(--accent-green)">${call.method}</strong> ${call.endpoint} -> ${status} ${statusText} (${duration}ms)`);
        }

        this.apiCalls.update(list => list.map(c => 
          c.id === call.id ? { 
            ...c, 
            status, 
            statusText, 
            duration, 
            responseBody: (status !== 204) ? responseBody : null 
          } : c
        ));
      });
  }

  // Run all 23 endpoints sequentially as a test suite
  async runTestSuite() {
    if (this.suiteRunning()) return;
    this.suiteRunning.set(true);
    this.progressPercent.set(0);

    // Reset statuses
    this.apiCalls.update(list => list.map(c => ({
      ...c,
      status: undefined,
      statusText: undefined,
      duration: undefined,
      responseBody: undefined
    })));

    this.addLog('warn', '==================================================');
    this.addLog('warn', 'STARTING INTEGRATION TEST SUITE RUNNER');
    this.addLog('warn', `Executing ${this.apiCalls().length} endpoints sequentially...`);
    this.addLog('warn', '==================================================');

    const totalCount = this.apiCalls().length;

    for (let i = 0; i < totalCount; i++) {
      const call = this.apiCalls()[i];
      
      // Execute the request asynchronously and await it
      await new Promise<void>((resolve) => {
        this.apiCalls.update(list => list.map(c => 
          c.id === call.id ? { ...c, loading: true } : c
        ));

        const startTime = performance.now();
        let requestObservable: Observable<any>;

        const url = this.apiBaseUrl() + call.endpoint;
        if (call.method === 'GET') {
          requestObservable = this.http.get(url);
        } else if (call.method === 'POST') {
          requestObservable = this.http.post(url, call.payload);
        } else if (call.method === 'PUT') {
          requestObservable = this.http.put(url, call.payload);
        } else if (call.method === 'DELETE') {
          requestObservable = this.http.delete(url);
        } else {
          requestObservable = of(null);
        }

        requestObservable
          .pipe(
            catchError((err: HttpErrorResponse) => of(err)),
            finalize(() => {
              this.apiCalls.update(list => list.map(c => 
                c.id === call.id ? { ...c, loading: false } : c
              ));
            })
          )
          .subscribe((response) => {
            const endTime = performance.now();
            const duration = Math.round(endTime - startTime);

            let status = 200;
            let statusText = 'OK';
            let responseBody: any = response;

            if (response instanceof HttpErrorResponse) {
              status = response.status;
              statusText = response.statusText || 'Error';
              responseBody = response.error || null;
              this.addLog('error', `[${i+1}/${totalCount}] ${call.method} ${call.endpoint} -> ${status} ${statusText} (${duration}ms)`);
            } else {
              if (call.method === 'POST') {
                status = 201;
                statusText = 'Created';
              } else if (call.method === 'PUT' || call.method === 'DELETE') {
                status = 204;
                statusText = 'No Content';
              }
              this.addLog('success', `[${i+1}/${totalCount}] ${call.method} ${call.endpoint} -> ${status} ${statusText} (${duration}ms)`);
            }

            this.apiCalls.update(list => list.map(c => 
              c.id === call.id ? { 
                ...c, 
                status, 
                statusText, 
                duration, 
                responseBody: (status !== 204) ? responseBody : null 
              } : c
            ));

            // Increment progress
            this.progressPercent.set(Math.round(((i + 1) / totalCount) * 100));
            resolve();
          });
      });

      // Pause briefly between calls for natural database visual sync
      await new Promise(r => setTimeout(r, 100));
    }

    this.suiteRunning.set(false);
    this.addLog('warn', '==================================================');
    this.addLog('success', `SUITE COMPLETED: ${this.successCount()}/${totalCount} Passed, ${this.failureCount()} Failed.`);
    this.addLog('warn', '==================================================');
    this.scrollToBottom();
  }

  // Get ASCII progress bar for developer look
  getAsciiProgressBar(): string {
    const barLength = 40;
    const progressChars = Math.round((this.progressPercent() / 100) * barLength);
    const emptyChars = barLength - progressChars;
    const filledBar = '='.repeat(progressChars);
    const arrow = progressChars < barLength ? '>' : '';
    const spacing = ' '.repeat(Math.max(0, emptyChars - (arrow ? 1 : 0)));
    return `[${filledBar}${arrow}${spacing}] ${this.progressPercent()}%`;
  }

  // Logger helper
  private addLog(type: 'info' | 'success' | 'error' | 'warn', message: string) {
    const time = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    this.terminalLogs.update(logs => [...logs, { timestamp: time, type, message }]);
    this.scrollToBottom();
  }

  clearLogs() {
    this.terminalLogs.set([]);
  }

  stringify(val: any): string {
    return JSON.stringify(val, null, 2);
  }

  private scrollToBottom() {
    setTimeout(() => {
      try {
        const el = this.terminalBody.nativeElement;
        el.scrollTop = el.scrollHeight;
      } catch (err) {}
    }, 50);
  }
}
