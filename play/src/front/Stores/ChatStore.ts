import { writable } from "svelte/store";
import { Subject } from "rxjs";
import { ChatMessageTypes } from "@workadventure/shared-utils";
import * as Sentry from "@sentry/svelte";
import type { PlayerInterface } from "../Phaser/Game/PlayerInterface";
import { iframeListener } from "../Api/IframeListener";
import { mediaManager, NotificationType } from "../WebRtc/MediaManager";
import { mucRoomsStore } from "../Chat/Stores/MucRoomsStore";
import { User } from "../Chat/Xmpp/AbstractRoom";
import { chatMessagesStore } from "../Chat/Stores/ChatStore";
import { playersStore } from "./PlayersStore";

export const chatZoneLiveStore = writable(false);
export const chatVisibilityStore = writable(false);

export const chatInputFocusStore = writable(false);

export const _newChatMessageSubject = new Subject<string>();
export const newChatMessageSubject = _newChatMessageSubject.asObservable();

// Call "forceRefresh" to force the refresh of the chat iframe.
function createForceRefreshChatStore() {
    const { subscribe, update } = writable({});
    return {
        subscribe,
        forceRefresh() {
            update((list) => {
                return {};
            });
        },
    };
}
export const forceRefreshChatStore = createForceRefreshChatStore();

function getAuthor(authorId: number): PlayerInterface {
    const author = playersStore.getPlayerById(authorId);
    if (!author) {
        throw new Error("Could not find data for author " + authorId);
    }
    return author;
}

function createWritingStatusMessageStore() {
    const { subscribe, update } = writable<Set<PlayerInterface>>(new Set<PlayerInterface>());
    return {
        subscribe,
        addWritingStatus(authorId: number, status: 5 | 6) {
            update((list) => {
                if (status === ChatMessageTypes.userWriting) {
                    list.add(getAuthor(authorId));
                } else if (status === ChatMessageTypes.userStopWriting) {
                    list.delete(getAuthor(authorId));
                }

                return list;
            });
        },
    };
}
export const writingStatusMessageStore = createWritingStatusMessageStore();

/**
 * We are storing a cache of authors because when someone leaves the chat, the player might be gone from the playersStore
 * before the chatMessageService is called to display the "out" message.
 */
const authorsCache = new Map<number, PlayerInterface>();

function getAuthorFromCache(authorId: number): PlayerInterface {
    let author = authorsCache.get(authorId);
    if (!author) {
        console.warn("Could not find author in cache. This should never happen. Trying to fetch it from playersStore");
        Sentry.captureMessage(
            "Could not find author in cache. This should never happen. Trying to fetch it from playersStore"
        );
        author = getAuthor(authorId);
    }
    return author;
}

export const chatMessagesService = {
    addIncomingUser(authorId: number) {
        const author = getAuthor(authorId);
        authorsCache.set(authorId, author);

        /* @deprecated with new chat service */
        iframeListener.sendComingUserToChatIframe({
            type: ChatMessageTypes.userIncoming,
            author: {
                name: author.name,
                active: true,
                isMe: false,
                jid: author.userJid,
                isMember: false,
                color: author.color ?? undefined,
            },
            date: new Date(),
        });
    },
    addOutcomingUser(authorId: number) {
        const author = getAuthorFromCache(authorId);
        // Let's remove the author from the cache now that he is out
        authorsCache.delete(authorId);
        const mucRoomDefault = mucRoomsStore.getDefaultRoom();
        let userData: User;
        if (mucRoomDefault && author.jid !== "fake") {
            let userDataDefaultMucRoom = mucRoomDefault.getUserByJid(
                author.jid
            );
            if (userDataDefaultMucRoom === undefined) {
                // Something went wrong while fetching user data from the default MucRoom.
                // Let's try a fallback.
                userDataDefaultMucRoom = {
                    name: "Unknown",
                    active: true,
                    jid: author.jid,
                    isMe: false,
                    isMember: false,
                };
            }
            userData = userDataDefaultMucRoom;
        } else {
            userData = author;
        }
        chatMessagesStore.addOutcomingUser(userData);

        //end of writing message
        writingStatusMessageStore.addWritingStatus(authorId, ChatMessageTypes.userStopWriting);
    },
    addPersonalMessage(text: string) {
        iframeListener.sendUserInputChat(text, undefined);
        _newChatMessageSubject.next(text);
    },
    /**
     * @param origin The iframe that originated this message (if triggered from the Scripting API), or undefined otherwise.
     */
    addExternalMessage(authorId: number, text: string, origin?: Window) {
        const author = getAuthorFromCache(authorId);

        //TODO delete it with new XMPP integration
        //send list to chat iframe
        iframeListener.sendMessageToChatIframe({
            type: ChatMessageTypes.text,
            text: [text],
            author: {
                name: author.name,
                active: true,
                isMe: false,
                jid: author.userJid,
                isMember: false,
                color: author.color ?? undefined,
            },
            date: new Date(),
        });

        //create message sound and text notification
        mediaManager.playNewMessageNotification();
        mediaManager.createNotification(author.name, NotificationType.message);
        //end of writing message
        writingStatusMessageStore.addWritingStatus(authorId, ChatMessageTypes.userStopWriting);

        iframeListener.sendUserInputChat(text, authorId, origin);

        chatVisibilityStore.set(true);
    },
    /**
     * Displays the "start writing" message in the chat.
     * This method is only used by the scripting API to fake the fact someone (the local robot) is writing in the chat.
     *
     * @param authorId
     * @param origin
     */
    startWriting(authorId: number, origin?: Window) {
        const author = getAuthorFromCache(authorId);

        //send list to chat iframe
        iframeListener.sendMessageToChatIframe({
            type: ChatMessageTypes.userWriting,
            author: {
                name: author.name,
                active: true,
                isMe: false,
                jid: author.userJid,
                isMember: false,
                color: author.color ?? undefined,
            },
            date: new Date(),
        });

        chatVisibilityStore.set(true);
    },
    /**
     * Displays the "start writing" message in the chat.
     * This method is only used by the scripting API to fake the fact someone (the local robot) is writing in the chat.
     *
     * @param authorId
     * @param origin
     */
    stopWriting(authorId: number, origin?: Window) {
        const author = getAuthorFromCache(authorId);

        //send list to chat iframe
        iframeListener.sendMessageToChatIframe({
            type: ChatMessageTypes.userStopWriting,
            author: {
                name: author.name,
                active: true,
                isMe: false,
                jid: author.userJid,
                isMember: false,
                color: author.color ?? undefined,
            },
            date: new Date(),
        });
    },
};

/*
function createChatSubMenuVisibilityStore() {
    const { subscribe, update } = writable<string>("");

    return {
        subscribe,
        openSubMenu(playerName: string, index: number) {
            const id = playerName + index;
            update((oldValue) => {
                return oldValue === id ? "" : id;
            });
        },
    };
}


export const chatSubMenuVisibilityStore = createChatSubMenuVisibilityStore();
*/
export const wokaDefinedStore = writable<boolean>(false);
export const iframeLoadedStore = writable<boolean>(false);
