import styled from '@emotion/styled'
import {PortalStatus} from './usePortal'
import {DECELERATE} from '../styles/animation'
import {Duration} from '../types/constEnums'
import TooltipStyled from '../components/TooltipStyled'

const backgroundStyles = (portalStatus: PortalStatus) => {
  switch (portalStatus) {
    case PortalStatus.Entering:
    case PortalStatus.Entered:
      return {
        opacity: 1,
        transform: 'scale(1)',
        transition: `all ${Duration.TOOLTIP_OPEN}ms ${DECELERATE}`
      }
    case PortalStatus.Exiting:
      return {
        opacity: 0,
        transition: `all ${Duration.TOOLTIP_CLOSE}ms ${DECELERATE}`
      }
    case PortalStatus.Mounted:
      return {
        transform: 'scale(0)'
      }
    default:
      return {}
  }
}

const TooltipBackground = styled(TooltipStyled)<{portalStatus: PortalStatus}>(({portalStatus}) => ({
  zIndex: -1,
  ...backgroundStyles(portalStatus)
}))

export default TooltipBackground
