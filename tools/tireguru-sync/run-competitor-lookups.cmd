@echo off
rem Task Scheduler entry point - on-demand competitor lookups (every 5 min, exits fast when idle)
cd /d "C:\Users\willi\OneDrive\Desktop\RHINO BRAIN CRM\tirepro-crm\tools\tireguru-sync"
node competitor-sync.mjs --pending
