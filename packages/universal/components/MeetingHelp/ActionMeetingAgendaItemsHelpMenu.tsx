import React, {forwardRef} from 'react'
import HelpMenuContent from './HelpMenuContent'
import HelpMenuCopy from './HelpMenuCopy'
import HelpMenuLink from './HelpMenuLink'
import useSegmentTrack from '../../hooks/useSegmentTrack'
import {NewMeetingPhaseTypeEnum, SegmentClientEventEnum} from '../../types/graphql'

interface Props {}

const ActionMeetingAgendaItemsHelpMenu = forwardRef((_props: Props, ref: any) => {
  const {closePortal} = ref
  useSegmentTrack(SegmentClientEventEnum.HelpMenuOpen, {phase: NewMeetingPhaseTypeEnum.firstcall})
  return (
    <HelpMenuContent closePortal={closePortal}>
      <HelpMenuCopy>
        {
          'The goal of this phase is to identify next steps and capture them as task cards assigned to an owner.'
        }
      </HelpMenuCopy>
      <HelpMenuCopy>
        {
          'Sometimes the next task is to schedule a time to discuss a topic more in depth at a later time.'
        }
      </HelpMenuCopy>
      <HelpMenuLink
        copy='Learn more'
        href='https://www.parabol.co/getting-started-guide/action-meetings-101#team-agenda'
      />
    </HelpMenuContent>
  )
})

export default ActionMeetingAgendaItemsHelpMenu
