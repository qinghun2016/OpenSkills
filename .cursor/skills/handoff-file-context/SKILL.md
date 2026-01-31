---
name: handoff-file-context
description: Handoff snapshot should include touchedFiles and decisionsMade for labor sharing
triggers:
  - handoff
  - jiaojie
---

## Overview
<!-- 概述 -->

When saving a handoff snapshot (e.g. via POST /api/scheduler/handoff/snapshot), include **touchedFiles** and **decisionsMade** so the next skills-admin session can reuse labor and avoid duplicate work.

Handoff snapshot should include touchedFiles and decisionsMade for labor sharing.
