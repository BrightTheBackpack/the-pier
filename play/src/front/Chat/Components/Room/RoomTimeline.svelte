<script lang="ts">
    import { afterUpdate, beforeUpdate, onMount } from "svelte";
    import { get } from "svelte/store";
    import { ChatRoom } from "../../Connection/ChatConnection";
    import getCloseImg from "../../images/get-close.png";
    import { selectedChatMessageToReply, selectedRoomStore } from "../../Stores/ChatStore";
    import Avatar from "../Avatar.svelte";
    import { matrixSecurity } from "../../Connection/Matrix/MatrixSecurity";
    import { localUserStore } from "../../../Connection/LocalUserStore";
    import { ProximityChatRoom } from "../../Connection/Proximity/ProximityChatRoom";
    import LL from "../../../../i18n/i18n-svelte";
    import Message from "./Message.svelte";
    import MessageInputBar from "./MessageInputBar.svelte";
    import MessageSystem from "./MessageSystem.svelte";
    import { IconChevronLeft, IconLoader, IconMailBox } from "@wa-icons";

    export let room: ChatRoom;
    let myChatID = localUserStore.getChatId();

    const NUMBER_OF_TYPING_MEMBER_TO_DISPLAY = 3;
    let typingMembers = room.typingMembers;
    let messageListRef: HTMLDivElement;
    let autoScroll = true;
    let onScrollTop = false;

    let oldScrollHeight = 0;

    let loadingMessagePromise: Promise<void> | undefined = undefined;

    let scrollTimer: ReturnType<typeof setTimeout>;
    let shouldDisplayLoader = false;

    let messageInputBarRef: MessageInputBar;

    $: messages = room?.messages;
    $: messageReaction = room?.messageReactions;
    $: roomName = room?.name;

    onMount(() => {
        initMessages()
            .catch((error) => console.error(error))
            .finally(() => {
                scrollToMessageListBottom();
            });
    });

    async function initMessages() {
        if (!messageListRef) return;

        const loadMessages = async () => {
            try {
                if (get(room.isEncrypted) && get(matrixSecurity.isEncryptionRequiredAndNotSet)) {
                    return;
                }

                await room.loadMorePreviousMessages();

                if (get(room.hasPreviousMessage) && isViewportNotFilled()) {
                    await loadMessages();
                }
            } catch (error) {
                console.error(`Failed to load messages: ${error}`);
            }
        };

        try {
            await loadMessages();
            scrollToMessageListBottom();
            setFirstListItem();
        } catch (error) {
            console.error(`Failed to load messages: ${error}`);
        }
    }

    beforeUpdate(() => {
        if (messageListRef) {
            oldScrollHeight = messageListRef.scrollHeight;
            const scrollableDistance = messageListRef.scrollHeight - messageListRef.offsetHeight;
            autoScroll = messageListRef.scrollTop > scrollableDistance - 20;
            onScrollTop = messageListRef.scrollTop === 0;
        }
    });

    afterUpdate(() => {
        room.setTimelineAsRead();
        if (autoScroll) {
            scrollToMessageListBottom();
        } else if (onScrollTop) {
            const oldFirstListItem = messageListRef.querySelector<HTMLLIElement>('li[data-first-li="true"]');

            if (oldFirstListItem !== null) {
                const newScrollHeight = messageListRef.scrollHeight;
                messageListRef.scrollTop = newScrollHeight - oldScrollHeight;
            }
            setFirstListItem();
        }
    });

    function scrollToMessageListBottom() {
        messageListRef.scroll({ top: messageListRef.scrollHeight, behavior: "smooth" });
    }

    function goBackAndClearSelectedChatMessage() {
        selectedChatMessageToReply.set(null);
        selectedRoomStore.set(undefined);
    }

    function handleScroll() {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            loadMorePreviousMessages();
        }, 100);
    }

    function loadMorePreviousMessages() {
        if (loadingMessagePromise || !shouldLoadMoreMessages()) return;

        loadingMessagePromise = new Promise<void>((resolve) => {
            (async () => {
                const loadMessages = async () => {
                    if (messageListRef.scrollTop === 0) {
                        shouldDisplayLoader = true;
                    }
                    await room.loadMorePreviousMessages();

                    if (shouldLoadMoreMessages()) {
                        loadMorePreviousMessages();
                    }
                };

                await loadMessages();
            })()
                .catch((error) => {
                    console.error(`Failed to load messages: ${error}`);
                    throw new Error(`Failed to load messages: ${error}`);
                })
                .finally(() => {
                    if (shouldDisplayLoader) {
                        shouldDisplayLoader = false;
                    }
                    resolve();
                });
        }).finally(() => {
            loadingMessagePromise = undefined;
        });
    }

    function shouldLoadMoreMessages() {
        const messages = Array.from(messageListRef?.querySelectorAll("li") || []);
        const messagesBeforeViewportTop = messages.find((msg) => msg.getBoundingClientRect().top >= 0);

        return (
            messagesBeforeViewportTop &&
            messages.indexOf(messagesBeforeViewportTop) < 10 &&
            messages.indexOf(messagesBeforeViewportTop) !== -1 &&
            get(room.hasPreviousMessage)
        );
    }

    function setFirstListItem() {
        const oldFirstListItem = messageListRef.querySelector<HTMLLIElement>('li[data-first-li="true"]');
        oldFirstListItem?.removeAttribute("data-first-li");

        const firstListItem = messageListRef.getElementsByTagName("li").item(0);
        firstListItem?.setAttribute("data-first-li", "true");
    }

    function isViewportNotFilled() {
        return messageListRef.scrollHeight <= messageListRef.clientHeight;
    }

    function onUpdateMessageBody(event: CustomEvent) {
        if (
            autoScroll ||
            (event.detail.id === $messages[$messages.length - 1].id &&
                $messages[$messages.length - 1].sender?.chatId === myChatID)
        ) {
            scrollToMessageListBottom();
        }
    }

    function onDropFiles(event: DragEvent) {
        if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
            messageInputBarRef.handleFiles({
                detail: event.dataTransfer.files,
            } as CustomEvent<FileList>);
        }
    }
</script>

<div
    class="tw-flex tw-flex-col tw-flex-auto tw-h-full tw-w-full tw-max-w-full"
    on:dragover|preventDefault
    on:drop|preventDefault|stopPropagation={onDropFiles}
>
    {#if room !== undefined}
        <div class="tw-flex tw-flex-col tw-gap-2">
            <div
                class="tw-p-2 tw-flex tw-items-center tw-border tw-border-solid tw-border-x-0 tw-border-b tw-border-t-0 tw-border-white/10"
            >
                <button
                    class="back-roomlist tw-p-3 hover:tw-bg-white/10 tw-rounded-2xl tw-aspect-square tw-w-12"
                    data-testid="chatBackward"
                    on:click={goBackAndClearSelectedChatMessage}
                >
                    <IconChevronLeft font-size="20" />
                </button>
                <div class="tw-text-md tw-font-bold tw-h-5 tw-grow tw-text-center" data-testid="roomName">
                    {$roomName}
                </div>
                <div class="tw-p-3 tw-rounded-2xl tw-aspect-square tw-w-12" />
            </div>
            {#if shouldDisplayLoader}
                <div class="tw-flex tw-justify-center tw-items-center tw-w-full tw-pb-1 tw-bg-transparent">
                    <IconLoader class="tw-animate-[spin_2s_linear_infinite]" font-size={25} />
                </div>
            {/if}
        </div>
        <div
            bind:this={messageListRef}
            class="tw-flex tw-overflow-auto tw-h-full tw-justify-center tw-items-end tw-relative"
            on:scroll={handleScroll}
        >
            <ul
                class="tw-list-none tw-p-0 tw-flex-1 tw-flex tw-flex-col tw-max-h-full tw-pt-10 {$messages.length === 0
                    ? 'tw-items-center tw-justify-center tw-pb-4'
                    : 'tw-max-w-6xl'}"
            >
                <!--{#if room.id === "proximity" && $connectedUsers !== undefined}-->
                <!--    <div class="tw-flex tw-flex-row tw-items-center tw-gap-2">-->
                <!--        {#each [...$connectedUsers] as [userId, user] (userId)}-->
                <!--            <div class="avatar">-->
                <!--                <Avatar avatarUrl={user.avatarUrl} fallbackName={user?.username} color={user?.color} />-->
                <!--            </div>-->
                <!--        {/each}-->
                <!--    </div>-->
                <!--{/if}-->
                {#if $messages.length === 0}
                    {#if room instanceof ProximityChatRoom}
                        <li class="tw-text-center tw-px-3 tw-max-w-md">
                            <img src={getCloseImg} alt="Discussion bubble" />
                            <div class="tw-text-lg tw-font-bold tw-text-center">{$LL.chat.getCloserTitle()}</div>
                            <div class="tw-text-sm tw-opacity-50 tw-text-center">
                                {$LL.chat.getCloserDesc()}
                            </div>
                        </li>
                    {:else}
                        <li class="tw-text-center tw-px-3 tw-max-w-md tw-relative">
                            <IconMailBox font-size="40" />
                            <div class="tw-text-lg tw-font-bold tw-text-center">{$LL.chat.noMessage()}</div>
                            <div class="tw-text-sm tw-opacity-50 tw-text-center">{$LL.chat.beFirst()}</div>
                            <div class="tw-absolute tw-w-10 tw-h-10 -tw-bottom-1.5 -tw-left-10">
                                <svg
                                    width="51"
                                    height="45"
                                    viewBox="0 0 51 45"
                                    fill="none"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        d="M7.46934 42.1088C7.31199 42.9222 7.84378 43.7091 8.65713 43.8664C9.47048 44.0238 10.2574 43.492 10.4147 42.6786L7.46934 42.1088ZM48.8329 3.45148C49.6538 3.34051 50.2294 2.58502 50.1184 1.76406C50.0074 0.943102 49.2519 0.367545 48.431 0.47852L48.8329 3.45148ZM3.03603 31.9911C2.60916 31.2811 1.68756 31.0516 0.977578 31.4785C0.267597 31.9053 0.038091 32.8269 0.464962 33.5369L3.03603 31.9911ZM7.22548 41.8701L5.93995 42.643L5.94067 42.6442L7.22548 41.8701ZM10.842 42.9209L10.2291 41.5518L10.2278 41.5524L10.842 42.9209ZM21.7611 39.6758C22.5172 39.3373 22.8557 38.4499 22.5172 37.6938C22.1787 36.9377 21.2913 36.5992 20.5352 36.9377L21.7611 39.6758ZM8.94203 42.3937C10.4147 42.6786 10.4147 42.679 10.4146 42.6792C10.4146 42.6792 10.4146 42.6794 10.4146 42.6794C10.4146 42.6794 10.4146 42.6792 10.4147 42.6786C10.4149 42.6776 10.4153 42.6755 10.416 42.6723C10.4172 42.666 10.4193 42.6556 10.4222 42.641C10.4281 42.612 10.4375 42.5667 10.4504 42.5059C10.4762 42.3842 10.5163 42.2006 10.5721 41.9611C10.6837 41.4819 10.8576 40.7796 11.1039 39.9023C11.5969 38.1466 12.3779 35.6973 13.5261 32.9384C15.8321 27.3978 19.5724 20.7218 25.3326 15.8605L23.3977 13.5678C17.1251 18.8616 13.1538 26.0254 10.7564 31.7857C9.55296 34.6773 8.73434 37.2439 8.21562 39.0914C7.95608 40.0157 7.77112 40.7618 7.6503 41.2807C7.58987 41.5402 7.54545 41.743 7.51573 41.883C7.50087 41.953 7.48968 42.0074 7.48201 42.0452C7.47817 42.0642 7.47521 42.079 7.4731 42.0896C7.47205 42.095 7.47121 42.0992 7.47059 42.1024C7.47027 42.104 7.47001 42.1054 7.46981 42.1064C7.4697 42.107 7.46959 42.1076 7.46953 42.1078C7.46943 42.1084 7.46934 42.1088 8.94203 42.3937ZM25.3326 15.8605C37.1451 5.89135 46.5336 3.76229 48.8329 3.45148L48.431 0.47852C45.5724 0.86493 35.6508 3.2269 23.3977 13.5678L25.3326 15.8605ZM0.464962 33.5369L5.93995 42.643L8.51102 41.0972L3.03603 31.9911L0.464962 33.5369ZM5.94067 42.6442C7.08293 44.54 9.46921 45.1811 11.4562 44.2894L10.2278 41.5524C9.52671 41.8671 8.81489 41.6015 8.51029 41.096L5.94067 42.6442ZM11.4549 44.29L21.7611 39.6758L20.5352 36.9377L10.2291 41.5518L11.4549 44.29Z"
                                        fill="#FAF7F0"
                                    />
                                </svg>
                            </div>
                        </li>
                    {/if}
                {/if}
                {#each $messages as message (message.id)}
                    <li class="last:tw-pb-3" data-event-id={message.id}>
                        {#if message.type === "outcoming" || message.type === "incoming"}
                            <MessageSystem {message} />
                        {:else}
                            <Message
                                on:updateMessageBody={onUpdateMessageBody}
                                {message}
                                reactions={$messageReaction.get(message.id)}
                            />
                        {/if}
                    </li>
                {/each}
            </ul>
        </div>

        {#if $typingMembers.length > 0}
            <div class="tw-flex tw-row tw-w-full tw-text-gray-300 tw-text-sm  tw-m-0 tw-px-2 tw-mb-2">
                {#each $typingMembers
                    .map((typingMember, index) => ({ ...typingMember, index }))
                    .slice(0, NUMBER_OF_TYPING_MEMBER_TO_DISPLAY) as typingMember (typingMember.id)}
                    {#if typingMember.avatarUrl || typingMember.name}
                        <div id={`typing-user-${typingMember.id}`} class="-tw-ml-2é">
                            <Avatar
                                isChatAvatar={true}
                                avatarUrl={typingMember.avatarUrl}
                                fallbackName={typingMember.name ? typingMember.name : "Unknown"}
                            />
                        </div>
                    {/if}
                {/each}

                {#if $typingMembers.length > NUMBER_OF_TYPING_MEMBER_TO_DISPLAY}
                    <div
                        class={`tw-rounded-full tw-h-6 tw-w-6 tw-text-center tw-uppercase tw-text-white tw-bg-gray-400 -tw-ml-1 chatAvatar`}
                    >
                        +{$typingMembers.length - NUMBER_OF_TYPING_MEMBER_TO_DISPLAY}
                    </div>
                {/if}
                <div
                    class="message tw-rounded-2xl tw-px-3 tw-rounded-bl-none tw-bg-contrast tw-flex tw-text-lg tw-ml-1"
                >
                    <div class="animate-bounce-1">.</div>
                    <div class="animate-bounce-2">.</div>
                    <div class="animate-bounce-3">.</div>
                </div>
            </div>
        {/if}
        <MessageInputBar {room} bind:this={messageInputBarRef} />
    {/if}
</div>

<style>
    @keyframes bounce {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(-25%);
        }
    }

    .animate-bounce-1 {
        animation: bounce 1s infinite;
    }

    .animate-bounce-2 {
        animation: bounce 1s infinite 0.1s;
    }

    .animate-bounce-3 {
        animation: bounce 1s infinite 0.2s;
    }

    .message {
        min-width: 0;
        overflow-wrap: anywhere;
        position: relative;
    }

    .chatAvatar {
        border-style: solid;
        border-color: rgb(27 42 65 / 0.95);
        border-width: 1px;
    }
</style>
