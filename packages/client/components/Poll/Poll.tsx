import React, {Ref, useCallback, useMemo} from 'react'
import styled from '@emotion/styled'
import {useFragment} from 'react-relay'
import graphql from 'babel-plugin-relay/macro'
import {Poll_poll$key} from '~/__generated__/Poll_poll.graphql'
import {Poll_discussion$key} from '~/__generated__/Poll_discussion.graphql'

import {PollContext} from './PollContext'
import {cardShadow, Elevation} from '~/styles/elevation'
import ThreadedItemWrapper from '../ThreadedItemWrapper'
import ThreadedAvatarColumn from '../ThreadedAvatarColumn'
import ThreadedItemHeaderDescription from '../ThreadedItemHeaderDescription'
import cardRootStyles from '~/styles/helpers/cardRootStyles'
import {PALETTE} from '~/styles/paletteV3'
import {updateLocalPollOption, addLocalPollOption, updateLocalPoll} from './local/newPoll'
import useAtmosphere from '~/hooks/useAtmosphere'
import CreatePollMutation from '~/mutations/CreatePollMutation'
import {Polls} from '~/types/constEnums'

const BodyCol = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  paddingBottom: 8,
  width: '100%',
  marginTop: 10
})

const PollRoot = styled('div')<{
  isFocused: boolean
}>(({isFocused}) => ({
  ...cardRootStyles,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'start',
  outline: 'none',
  padding: `0`,
  overflow: 'hidden',
  color: PALETTE.SLATE_600,
  backgroundColor: PALETTE.WHITE,
  border: `1.5px solid ${isFocused ? PALETTE.SKY_400 : PALETTE.SLATE_400}`,
  boxShadow: isFocused ? cardShadow : Elevation.Z0
}))

interface Props {
  children: React.ReactNode
  poll: Poll_poll$key
  discussion: Poll_discussion$key
  dataCy: string
}

const Poll = React.forwardRef((props: Props, ref: Ref<HTMLDivElement>) => {
  const {dataCy, poll: pollRef, discussion: discussionRef, children} = props
  const poll = useFragment(
    graphql`
      fragment Poll_poll on Poll {
        id
        title
        createdBy
        createdByUser {
          id
          preferredName
          picture
        }
        threadSortOrder
        options {
          id
          title
          placeholder
        }
      }
    `,
    pollRef
  )
  const discussion = useFragment(
    graphql`
      fragment Poll_discussion on Discussion {
        id
      }
    `,
    discussionRef
  )
  const atmosphere = useAtmosphere()
  const {picture, preferredName} = poll.createdByUser
  const [isPollFocused, setIsPollFocused] = React.useState(false)
  const [selectedPollOptionId, setSelectedOptionId] = React.useState<string | null>(null)
  const onPollOptionSelected = React.useCallback((optionId: string) => {
    setSelectedOptionId(optionId)
  }, [])
  const onPollFocused = useCallback(() => {
    setIsPollFocused(true)
  }, [])
  const onPollBlurred = useCallback(() => {
    setIsPollFocused(false)
  }, [])
  const updatePollOption = useCallback(
    (id: string, updatedValue: string) => {
      updateLocalPollOption(atmosphere, id, updatedValue)
    },
    [atmosphere]
  )
  const updatePoll = useCallback(
    (id: string, updatedTitle: string) => {
      updateLocalPoll(atmosphere, id, updatedTitle)
    },
    [atmosphere]
  )
  const addPollOption = useCallback(() => {
    addLocalPollOption(atmosphere, poll.id, poll.options.length + 1)
  }, [atmosphere, poll])
  const createPoll = useCallback(() => {
    CreatePollMutation(
      atmosphere,
      {
        newPoll: {
          discussionId: discussion.id,
          title: poll.title,
          threadSortOrder: poll.threadSortOrder!,
          options: poll.options.map((option) => {
            return {title: option.title}
          })
        }
      },
      {localPoll: poll}
    )
  }, [atmosphere, poll, discussion.id])
  const pollContextValue = useMemo(() => {
    const {title, options} = poll
    const pollState = poll.id.includes('tmp') ? 'creating' : 'created'
    const isPollTitleValid =
      title?.length > Polls.MIN_TITLE_LENGTH && title?.length <= Polls.MAX_TITLE_LENGTH
    const arePollOptionsValid =
      options.length >= Polls.MIN_OPTIONS &&
      options.length <= Polls.MAX_OPTIONS &&
      options.every(
        ({title}) =>
          title?.length > Polls.MIN_OPTION_LENGTH && title?.length <= Polls.MAX_OPTION_LENGTH
      )
    const canCreatePoll = pollState === 'creating' && isPollTitleValid && arePollOptionsValid

    return {
      pollState,
      poll,
      onPollOptionSelected,
      selectedPollOptionId,
      updatePoll,
      updatePollOption,
      createPoll,
      addPollOption,
      canCreatePoll,
      onPollFocused,
      onPollBlurred
    } as const
  }, [
    onPollOptionSelected,
    selectedPollOptionId,
    poll,
    updatePollOption,
    createPoll,
    addPollOption
  ])

  return (
    <PollContext.Provider value={pollContextValue}>
      <ThreadedItemWrapper data-cy={`${dataCy}-wrapper`} isReply={false} ref={ref}>
        <ThreadedAvatarColumn isReply={false} picture={picture} />
        <BodyCol>
          <ThreadedItemHeaderDescription
            title={preferredName}
            subTitle={
              pollContextValue.pollState === 'creating' ? 'is creating a Poll...' : 'added a Poll'
            }
          />
          <PollRoot ref={ref} isFocused={isPollFocused}>
            {children}
          </PollRoot>
        </BodyCol>
      </ThreadedItemWrapper>
    </PollContext.Provider>
  )
})

export default Poll
