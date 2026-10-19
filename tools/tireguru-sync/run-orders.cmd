@echo off
rem Task Scheduler entry point — SMS order queue -> TireGuru work orders
cd /d "C:\Users\willi\OneDrive\Desktop\RHINO BRAIN CRM\tirepro-crm\tools\tireguru-sync"
node order-runner.mjs
