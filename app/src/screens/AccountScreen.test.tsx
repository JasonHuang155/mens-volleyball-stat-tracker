// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { loadLogin, saveLogin } from '../sync/login.ts'
import { fakeServer, noConnection, testLogin } from '../test/fakeServer.ts'
import { renderApp } from '../test/renderApp.tsx'

const loginReply = { ...testLogin(), tokenType: 'bearer' }

describe('account screen', () => {
  it('logs in and shows who you are', async () => {
    const requests = fakeServer(() => ({ body: loginReply }))
    const { user } = renderApp('/account')
    await user.type(await screen.findByLabelText('Email'), 'sam@example.com')
    await user.type(screen.getByLabelText('Password'), 'volleyball!')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect((await screen.findByText(/Logged in as/)).textContent).toBe('Logged in as sam@example.com')
    expect(requests).toEqual([
      {
        method: 'POST',
        path: '/auth/login',
        body: { email: 'sam@example.com', password: 'volleyball!' },
        authorization: undefined,
      },
    ])
    expect(loadLogin()?.accessToken).toBe('test-token') // still logged in after closing the app
  })

  it("shows the server's reason when logging in fails", async () => {
    fakeServer(() => ({ status: 401, body: { detail: 'Wrong email or password' } }))
    const { user } = renderApp('/account')
    await user.type(await screen.findByLabelText('Email'), 'sam@example.com')
    await user.type(screen.getByLabelText('Password'), 'basketball')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Wrong email or password')
    expect(loadLogin()).toBeNull()
  })

  it('makes a new account', async () => {
    const requests = fakeServer(() => ({ status: 201, body: loginReply }))
    const { user } = renderApp('/account')
    await user.click(await screen.findByLabelText('New account'))
    await user.type(screen.getByLabelText('Email'), 'sam@example.com')
    await user.type(screen.getByLabelText('Password'), 'volleyball!')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText(/Logged in as/)).toBeTruthy()
    expect(requests[0].path).toBe('/auth/signup')
  })

  it('checks the password is long enough before making the account', async () => {
    const requests = fakeServer()
    const { user } = renderApp('/account')
    await user.click(await screen.findByLabelText('New account'))
    await user.type(screen.getByLabelText('Email'), 'sam@example.com')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Use a password of at least 8 characters')
    expect(requests).toEqual([])
  })

  it("says when the server can't be reached", async () => {
    noConnection()
    const { user } = renderApp('/account')
    await user.type(await screen.findByLabelText('Email'), 'sam@example.com')
    await user.type(screen.getByLabelText('Password'), 'volleyball!')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      "Can't reach the server. Check your connection and try again.",
    )
  })

  it('logs out', async () => {
    saveLogin(testLogin())
    fakeServer()
    const { user } = renderApp('/account')
    await user.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeTruthy()
    expect(loadLogin()).toBeNull()
  })
})
