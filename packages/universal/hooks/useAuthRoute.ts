import useAtmosphere from './useAtmosphere'
import useRouter from './useRouter'
import {useEffect} from 'react'
import {AuthTokenRole} from '../types/graphql'

interface Options {
  role?: AuthTokenRole
  silent?: boolean
}

const unauthorizedDefault = {
  autoDismiss: 5,
  message: 'Hey! You’re not supposed to be there. Bringing you someplace safe.',
  key: 'unauthorized'
}

const unauthenticatedDefault = {
  autoDismiss: 5,
  message: 'Hey! You haven’t signed in yet. Taking you to the sign in page.',
  key: 'unauthenticated'
}

const useAuthRoute = (options: Options = {}) => {
  const atmosphere = useAtmosphere()
  const {history} = useRouter()
  useEffect(() => {
    const {authObj} = atmosphere
    const {role, silent} = options
    if (authObj) {
      if (role && role !== authObj.rol) {
        atmosphere.eventEmitter.emit('addSnackbar', unauthorizedDefault)
        history.replace('/')
      }
    } else {
      if (!silent) {
        setTimeout(() => {
          atmosphere.eventEmitter.emit('addSnackbar', unauthenticatedDefault)
        })
      }
      history.replace({
        pathname: '/',
        search: `?redirectTo=${encodeURIComponent(window.location.pathname)}`
      })
    }
  }, [])
}

export default useAuthRoute
