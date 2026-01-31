import { test, expect } from '@playwright/test';

/** Mock 提议：用于 e2e 验证界面直接创建提议 */
const MOCK_SKILL_NAME = `e2e-mock-skill-${Date.now()}`;
const MOCK_REASON = 'E2E 测试：界面直接提议，格式校验通过';
const MOCK_SKILL_CONTENT = `---
name: ${MOCK_SKILL_NAME}
description: E2E mock skill for create-proposal test
---

# ${MOCK_SKILL_NAME}

此 skill 由 Playwright e2e 通过「创建提议」表单创建，用于验证界面直接提议流程。
`;

test.describe('提议创建', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/proposals');
    await page.waitForLoadState('networkidle');
  });

  test('通过表单仅创建提议后，列表中可见该提议', async ({ page }) => {
    await page.getByTestId('open-create-proposal').click();
    await expect(page.getByTestId('create-proposal-skill-name')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('create-proposal-skill-name').fill(MOCK_SKILL_NAME);
    await page.getByTestId('create-proposal-reason').fill(MOCK_REASON);
    await page.getByTestId('create-proposal-diff').fill(MOCK_SKILL_CONTENT);

    await page.getByTestId('create-proposal-submit-only').click();

    await expect(page.getByTestId(`proposal-item-${MOCK_SKILL_NAME}`)).toBeVisible({
      timeout: 10000,
    });
  });

  test('通过表单创建并立即通过并应用后，提议出现在列表中', async ({ page }) => {
    await page.getByTestId('open-create-proposal').click();
    await expect(page.getByTestId('create-proposal-skill-name')).toBeVisible({ timeout: 5000 });

    const skillName = `e2e-apply-${Date.now()}`;
    const content = `---
name: ${skillName}
description: E2E apply test
---

# ${skillName}

E2E 创建并立即通过并应用测试。
`;

    await page.getByTestId('create-proposal-skill-name').fill(skillName);
    await page.getByTestId('create-proposal-reason').fill('E2E 创建并应用');
    await page.getByTestId('create-proposal-diff').fill(content);

    await page.getByTestId('create-proposal-submit-and-apply').click();

    await expect(page.getByTestId(`proposal-item-${skillName}`)).toBeVisible({
      timeout: 25000,
    });
  });
});
