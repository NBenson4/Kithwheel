// Editing published schedules keeps them live; deleting classes is safe.
import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { CoopClassRecord, CoopRecord, ScheduleList } from '@/lib/contracts/coops';

async function signUpWithCoop(page: Page, baseURL: string | undefined) {
  const origin = new URL(baseURL ?? process.env.BASE_URL ?? 'http://localhost:3000').origin;
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Editing Coordinator');
  await page.getByLabel('Email address').fill(`editing-${randomUUID()}@example.test`);
  await page.getByLabel('Password').fill(`Kithwheel-${randomUUID()}-9a`);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const request = page.request;
  const coop = CoopRecord.parse(
    await (
      await request.post('/api/coops', {
        headers: { origin },
        data: { name: `Editing Co-op ${randomUUID().slice(0, 6)}` },
      })
    ).json(),
  );
  return { request, origin, coopId: coop.id };
}

async function addClass(request: APIRequestContext, origin: string, coopId: string, name: string) {
  const response = await request.post(`/api/coops/${coopId}/classes`, {
    headers: { origin },
    data: { name },
  });
  expect(response.status()).toBe(201);
  return CoopClassRecord.parse(await response.json());
}

test('editing a published schedule keeps it published and current', async ({ page, baseURL }) => {
  const { request, origin, coopId } = await signUpWithCoop(page, baseURL);
  const art = await addClass(request, origin, coopId, 'Art Studio');
  const music = await addClass(request, origin, coopId, 'Music Circle');

  const created = ScheduleList.parse(
    await (
      await request.post(`/api/coops/${coopId}/schedules`, {
        headers: { origin },
        data: { title: 'Fall Term' },
      })
    ).json(),
  );
  const scheduleId = created.items[0]?.id ?? '';
  await request.patch(`/api/coops/${coopId}/schedules/${scheduleId}`, {
    headers: { origin },
    data: { rotations: [{ ageGroup: 'K-2', classIds: [art.id] }] },
  });
  const published = await request.post(`/api/coops/${coopId}/schedules/${scheduleId}/publish`, {
    headers: { origin },
    data: {},
  });
  expect(published.status()).toBe(200);

  // Fix the title and add a class through the UI.
  await page.reload();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('note')).toContainText('changes go live for families');
  await page.locator('#edit-schedule-title').fill('Fall Term 2026');
  await page.getByLabel('Add a class from this co-op').selectOption({ label: 'Music Circle' });
  await page.getByRole('button', { name: 'Add class' }).click();
  await page.getByRole('button', { name: 'Save arrangement' }).click();
  await expect(page.getByText('The published schedule is updated for families')).toBeVisible();

  const afterEdit = ScheduleList.parse(
    await (await request.get(`/api/coops/${coopId}/schedules`)).json(),
  );
  const saved = afterEdit.items.find((item) => item.id === scheduleId);
  expect(saved?.status).toBe('published');
  expect(saved?.title).toBe('Fall Term 2026');
  expect(afterEdit.currentScheduleId).toBe(scheduleId);
  expect(saved?.rotations[0]?.entries.map((entry) => entry.class.id)).toEqual([art.id, music.id]);

  // An edit that would leave an age group empty is refused, and nothing changes.
  const emptied = await request.patch(`/api/coops/${coopId}/schedules/${scheduleId}`, {
    headers: { origin },
    data: { rotations: [{ ageGroup: 'K-2', classIds: [] }] },
  });
  expect(emptied.status()).toBe(409);
  const unchanged = ScheduleList.parse(
    await (await request.get(`/api/coops/${coopId}/schedules`)).json(),
  );
  expect(unchanged.currentScheduleId).toBe(scheduleId);
  expect(unchanged.items[0]?.rotations[0]?.entries).toHaveLength(2);
});

test('classes can be deleted, except while in a published schedule', async ({ page, baseURL }) => {
  const { request, origin, coopId } = await signUpWithCoop(page, baseURL);
  const keep = await addClass(request, origin, coopId, 'Keep Me');
  const scratch = await addClass(request, origin, coopId, 'Scratch Class');

  const created = ScheduleList.parse(
    await (
      await request.post(`/api/coops/${coopId}/schedules`, {
        headers: { origin },
        data: { title: 'Live Plan' },
      })
    ).json(),
  );
  const scheduleId = created.items[0]?.id ?? '';
  await request.patch(`/api/coops/${coopId}/schedules/${scheduleId}`, {
    headers: { origin },
    data: { rotations: [{ ageGroup: 'All ages', classIds: [keep.id] }] },
  });
  await request.post(`/api/coops/${coopId}/schedules/${scheduleId}/publish`, {
    headers: { origin },
    data: {},
  });

  // A class in the published schedule is protected.
  const blocked = await request.delete(`/api/coops/${coopId}/classes/${keep.id}`, {
    headers: { origin },
  });
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).error).toContain('published schedule');

  // An unused class is deleted from the UI after confirming.
  await page.reload();
  await page.getByRole('button', { name: 'Edit Scratch Class' }).click();
  await page.getByRole('button', { name: 'Delete class' }).click();
  await expect(page.getByText(/Delete “Scratch Class”\? This can’t be undone/)).toBeVisible();
  await page.getByRole('button', { name: 'Keep it' }).click();
  await expect(page.getByRole('button', { name: 'Edit Scratch Class' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete class' }).click();
  await page.getByRole('button', { name: 'Yes, delete class' }).click();
  await expect(page.getByText('Scratch Class deleted')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Scratch Class' })).toHaveCount(0);

  const gone = await request.delete(`/api/coops/${coopId}/classes/${scratch.id}`, {
    headers: { origin },
  });
  expect(gone.status()).toBe(404);

  // Another co-op's class can never be deleted.
  const foreign = await request.delete(`/api/coops/not-my-coop/classes/${keep.id}`, {
    headers: { origin },
  });
  expect(foreign.status()).toBe(403);
});
