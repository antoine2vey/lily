import { fmt } from '@/i18n'
import type { Messages } from '@/i18n/en'
import type { Engine } from '../../live'
import { data, el, icon, setup, toaster } from './kit'

// CareScreen: a tap starts the 5 second undo, then the task completes,
// leaves the list and a toast confirms.
export const mount: Engine<Messages['Phone']> = (root, { care: t }) => {
  const { c, on, signal, stop } = setup(root)
  const toast = toaster(root, c)
  const count = el(root, '[data-count]')
  const skip = el(root, '.m-a-skip')
  const skipping = () => skip.getAttribute('aria-checked') === 'true'
  on(skip, () => skip.setAttribute('aria-checked', String(!skipping())))

  for (const list of root.querySelectorAll<HTMLElement>('[data-list]')) {
    for (const li of list.querySelectorAll<HTMLElement>(':scope > li')) {
      const task = el(li, '.m-a-task')
      const tick = el(task, '.m-a-tick')
      let timer = 0
      let undo: HTMLElement | undefined
      const dropUndo = () => {
        undo?.remove()
        undo = undefined
      }
      const done = () => {
        dropUndo()
        task.classList.remove('is-pend')
        task.classList.add('is-done')
        tick.hidden = false
        tick.innerHTML = icon('check-circle', 28)
        toast(
          fmt(t.doneToast, {
            plant: data(task, 'name'),
            verb: data(task, 'done'),
          })
        )
        c.later(500, () => {
          li.classList.add('is-gone')
          if (list.dataset.list !== 'overdue') return
          const left = list.querySelectorAll('li:not(.is-gone)').length
          count.textContent = String(left)
          if (left) return
          c.later(350, () => {
            list.hidden = true
            el(root, '[data-sec="overdue"]').hidden = true
          })
        })
      }
      const press = () => {
        if (task.classList.contains('is-pend')) return
        if (task.classList.contains('is-done')) return
        if (skipping()) {
          done()
          return
        }
        task.classList.add('is-pend')
        tick.hidden = true
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'm-a-undo'
        btn.innerHTML = `${t.undo}<svg aria-hidden="true"><rect width="100%" height="100%" rx="8" pathLength="100"/></svg>`
        btn.addEventListener(
          'click',
          (e) => {
            e.stopPropagation()
            c.cancel(timer)
            dropUndo()
            task.classList.remove('is-pend')
            tick.hidden = false
          },
          { signal }
        )
        task.append(btn)
        undo = btn
        timer = c.wait(5000, done)
      }
      on(task, press)
      task.addEventListener(
        'keydown',
        (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          press()
        },
        { signal }
      )
    }
  }
  return stop
}
