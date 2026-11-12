// Run with playwright-cli run-code --filename after opening the generated overview fixture.
// Uses only synthetic data and native desktop viewport sizes. It never opens a real Session.
async page => {
  const base = page.url().split('?')[0]
  const checks = []
  const check = (condition, name) => { if (!condition) throw new Error(name); checks.push(name) }
  const contrast = () => page.locator('.sah-analysis .sah-overview-foot').first().evaluate(el => {
    const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      .reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0)
    let parent = el, background
    while (parent) {
      const color = getComputedStyle(parent).backgroundColor
      if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') { background = color; break }
      parent = parent.parentElement
    }
    const foreground = luminance(getComputedStyle(el).color), back = luminance(background)
    return (Math.max(foreground, back) + .05) / (Math.min(foreground, back) + .05)
  })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.goto(base)
  await page.getByRole('button', { name: '用量分析', exact: true }).waitFor()
  check(await page.getByRole('region', { name: '角色与用量', exact: true }).isVisible(), 'analysis is the default desktop view')
  check(await page.getByRole('img', { name: /审查 · 未缓存输入/ }).count() === 1, 'role chart has numeric accessible evidence')
  check(!await page.locator('.sah-overview').evaluate(el => el.scrollWidth > el.clientWidth), 'desktop panel has no horizontal overflow')
  check(await contrast() >= 4.5, 'light explanatory text meets 4.5:1 contrast')
  await page.locator('.qa-sidebar').screenshot({ path: 'output/playwright/analytics-desktop-light.png' })
  await page.getByRole('button', { name: '共享任务板 5', exact: true }).click()
  await page.getByRole('button', { name: 'builder/checker', exact: true }).click()
  check(await page.evaluate(() => qa.opened.some(value => value.childSessionId === 'nested-checker' && value.parentSessionId === 'b')), 'nested task owner opens its exact direct-parent address')
  await page.getByRole('combobox', { name: '任务负责人' }).selectOption('owner-id:nested-checker')
  check(await page.getByText('显示 1/5 项任务', { exact: true }).isVisible(), 'owner filter uses stable identity')
  await page.getByRole('button', { name: '成员 6', exact: true }).click()
  await page.getByRole('searchbox').fill('builder/checker')
  check(await page.getByRole('heading', { name: 'checker', exact: true }).isVisible(), 'member paths are searchable without replacing names')
  check(await page.locator('.sah-overview-card').count() === 1, 'nested path search returns only the matching member')
  await page.getByRole('button', { name: '用量分析', exact: true }).focus()
  await page.keyboard.press('Tab')
  check(await page.getByRole('button', { name: '成员 6', exact: true }).evaluate(el => document.activeElement === el && getComputedStyle(el).outlineStyle !== 'none'), 'keyboard navigation keeps a visible focus indicator')
  await page.getByRole('button', { name: '用量分析', exact: true }).click()
  await page.getByText('配置对照 (2)', { exact: false }).click()
  check(await page.getByText(/显式覆盖或后续配置更新均可能造成差异，不代表执行失败/).isVisible(), 'configuration comparison explains legitimate overrides')
  await page.getByRole('button', { name: '其他页签', exact: true }).click()
  const hiddenReads = await page.evaluate(() => qa.calls.length)
  await page.waitForTimeout(3500)
  check(await page.evaluate(() => qa.calls.length) === hiddenReads, 'hidden sidebar stops high-frequency reads')
  await page.getByRole('button', { name: '子智能体', exact: true }).click()
  await page.evaluate(() => qa.setReadDelay(300))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await page.getByRole('button', { name: '其他页签', exact: true }).click()
  const scheduled = await page.evaluate(() => qa.calls.length)
  await page.waitForTimeout(800)
  check(await page.evaluate(() => qa.calls.length) === scheduled, 'closing during a slow read prevents new descendant scheduling')
  await page.goto(`${base}?theme=dark&lang=en`)
  await page.getByRole('region', { name: 'Roles and usage', exact: true }).waitFor()
  check(await page.getByRole('button', { name: 'Usage analysis', exact: true }).isVisible(), 'English labels are available')
  check(!await page.locator('.sah-overview').evaluate(el => el.scrollWidth > el.clientWidth), 'dark desktop panel has no horizontal overflow')
  check(await contrast() >= 4.5, 'dark explanatory text meets 4.5:1 contrast')
  await page.locator('.qa-sidebar').screenshot({ path: 'output/playwright/analytics-desktop-dark.png' })
  await page.goto(base)
  await page.getByRole('button', { name: '用量分析', exact: true }).waitFor()
  await page.evaluate(() => qa.setFailure(true))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  check(await page.getByText(/部分数据刷新失败/).isVisible(), 'read failures preserve data with an explicit stale notice')
  await page.evaluate(() => { qa.setFailure(false); qa.setEmpty() })
  check(await page.getByText(/这个会话还没有子智能体/).isVisible(), 'empty catalog has a useful explanation')
  check(errors.length === 0, `no unhandled page errors: ${errors.join('; ')}`)
  return { checks, screenshots: ['output/playwright/analytics-desktop-light.png', 'output/playwright/analytics-desktop-dark.png'] }
}
