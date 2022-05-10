import {ConnInfo} from "https://deno.land/std@0.136.0/http/server.ts";
import {assert} from "https://deno.land/std@0.136.0/_util/assert.ts";
import {
    Room,
    RoomEvent,
    User,
    UserAddress,
    UserAddressOptions,
    UserJoinEvent,
    UserLeftEvent,
    UserOptions,
    UserWelcomeEvent,
    getProfile,
} from "https://raw.githubusercontent.com/ukaj808/augslink-lib/master/mod.ts";
import {getRandyUsernameFetch} from "https://raw.githubusercontent.com/ukaj808/augslink-randy/master/mod.ts";

export const createUser = async (req: Request, connInfo: ConnInfo, options: UserOptions): Promise<{ user: User, response: Response }> => {
    const {hostname, port} = getRemoteAddress(connInfo);
    const {response, socket} = Deno.upgradeWebSocket(req);
    const userId: string = crypto.randomUUID();
    const username: string = await getRandyUsernameFetch({env: getProfile()});

    socket.onopen = options.onJoin;
    socket.onclose = options.onLeave;

    return {
        user: {
            id: userId,
            address: createUserAddress({
                port: port,
                hostname: hostname,
                socket: socket
            }),
            queue: [],
            username: username
        },
        response
    }
}

export const createUserAddress = (options: UserAddressOptions): UserAddress => {
    return {
        hostname: options.hostname,
        port: options.port,
        socket: options.socket
    }
}

export class RoomManager {

    private rooms: Map<string, Room>;

    constructor() {
        this.rooms = new Map<string, Room>();
    }

    public getRoom(roomId: string): Room {
        return this.rooms.get(roomId) as Room;
    }

    public createRoom(): string {
        const roomId: string = generateId(7);

        const newRoom: Room = {
            id: roomId,
            vote: {
                numVotedForSkip: 0
            },
            currentSong: null,
            connectedUsers: new Map<string, User>()
        }

        this.rooms.set(roomId, newRoom);

        return roomId;
    }

    public joinRoom(roomId: string, user: User): void {
        if (!this.doesRoomExist(roomId)) throw new Error("Room doesn't exist");
        const room = this.rooms.get(roomId) as Room;
        room?.connectedUsers.set(user.id, user);
        const userJoinEvent: UserJoinEvent = {
            eventId: "123",
            type: "UserJoinEvent",
            userId: user.id,
            username: user.username
        }
        const userWelcomeEvent: UserWelcomeEvent = {
            eventId: "123",
            type: "UserWelcomeEvent",
            userId: user.id,
            username: user.username,
            roomState: room
        }
        this.publishTo(roomId, userWelcomeEvent, user.id);
        this.publishAllBut(roomId, userJoinEvent, user.id);
    }

    public leaveRoom(roomId: string, user: User): void {
        if (!this.doesRoomExist(roomId)) throw new Error("Room doesn't exist");
        if (!this.isUserInRoom(roomId, user.id)) throw new Error("User doesn't exist in this room");

        const room = this.rooms.get(roomId);

        room?.connectedUsers.delete(user.id);

        const userLeftEvent: UserLeftEvent = {
            eventId: "123",
            type: "UserLeftEvent",
            userId: user.id
        }

        if (this.isRoomEmpty(roomId)) this.closeRoom(roomId);
        else this.publishAll(roomId, userLeftEvent);
    }

    public doesRoomExist(roomId: string): boolean {
        return this.rooms.has(roomId);
    }

    private isUserInRoom(roomId: string, userId: string) {
        return this.rooms.get(roomId)?.connectedUsers.has(userId);
    }

    private isRoomEmpty(roomId: string): boolean {
        return this.rooms.get(roomId)?.connectedUsers.size == 0;
    }

    private publishAll(roomId: string, event: RoomEvent): void {
        if (!this.doesRoomExist(roomId)) throw new Error("Room doesn't exist");
        this.rooms.get(roomId)?.connectedUsers.forEach(user => user.address.socket.send(stringify(event)));
    }

    private publishAllBut(roomId: string, event: RoomEvent, userId: string): void {
        if (!this.doesRoomExist(roomId)) throw new Error("Room doesn't exist");
        this.rooms.get(roomId)?.connectedUsers.forEach(((user, id) => {
            if (userId !== id) user.address.socket.send(stringify(event))
        }));
    }

    private publishTo(roomId: string, event: RoomEvent, userId: string): void {
        if (!this.doesRoomExist(roomId)) throw new Error("Room doesn't exist");
        if (!this.isUserInRoom(roomId, userId)) throw new Error("User doesn't exist in this room");
        this.rooms.get(roomId)?.connectedUsers.get(userId)?.address.socket.send(stringify(event));
    }

    private closeRoom(roomId: string): void {
        if (!this.doesRoomExist(roomId)) throw new Error("Room doesn't exist");
        this.rooms.delete(roomId);
    }

}

export const instanceOfNetAddress = (address: Deno.Addr): address is Deno.NetAddr => 'hostname' in address;

export const getRemoteAddress = (connInfo: ConnInfo): Deno.NetAddr => {
    assert(instanceOfNetAddress(connInfo.remoteAddr), `Invalid connection type: ${typeof connInfo.remoteAddr}`);
    return connInfo.remoteAddr;
}

export interface TsMapHelper {
    dataType: string;
    value: Array<any>;
}

export function replacer(key: string, value: Object): TsMapHelper | Object {
    if (value instanceof Map) {
        return {
            dataType: 'Map',
            value: Array.from(value.entries()),
        };
    } else {
        return value;
    }
}

export const reviver = (key: string, value: Object): unknown => {
    if(value === 'object' && value !== null) {
        let tsMapHelper = value as TsMapHelper;
        if (tsMapHelper.dataType === 'Map') {
            return new Map(tsMapHelper.value);
        }
    }
    return value;
}

// Workaround for the fact that js/ts can't serialize/deserialize maps
export function stringify(o: any): string {
    return JSON.stringify(o, replacer);
}

export const generateId = (length: number) => {
    let result = '';
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }
    return result;
}

const profile = Deno.env.get("profile");
const wsProtocol =  (profile != null && profile === "prod") ? "wss" : "ws";
export const getRoomPathPattern: URLPattern = new URLPattern({ pathname: "/api/v1/:id" });
export const roomWsConnectPattern: URLPattern = new URLPattern({ pathname: `/api/v1/:id/${wsProtocol}` });

export const notFound: Response = new Response("", {
    status: 404,
    headers: {"content-type": "application/json",},
});

export const roomCreated = (roomId: string): Response =>
    new Response(roomId, {status: 201, headers: {"content-type": "application/json",},});

export const roomFound = (room: Room): Response => new Response(stringify(room), {
    status: 200,
    headers: {"content-type": "application/json",},
});

export const createRoomFetch = async (options: { env: "local" | "prod" }): Promise<string> => {
    const url: string = getUrl(options.env).concat("/api/v1/create-room");
    const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'text/plain',}});
    return await response.text();
}

export const getRoomFetch = async (id: string, options: { env: "local" | "prod" }): Promise<Room> => {
    const url: string = getUrl(options.env).concat(`/api/v1/${id}`);
    const response: Response = await fetch(url);
    return await JSON.parse(await response.text(), reviver) as Room;
}

export const getUrl = (env: string): string => {
    switch (env) {
        case "local":
            return "http://localhost:8001";
        case "prod":
            return "https://augslink-rooms.deno.dev";
    }
    return "";
}
