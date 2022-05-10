import {ConnInfo, serve} from "https://deno.land/std@0.136.0/http/server.ts";
import {createUser, notFound, roomCreated, RoomManager, roomWsConnectPattern} from "./mod.ts";

const roomManager: RoomManager = new RoomManager();

const handle = async (req: Request, connInfo: ConnInfo): Promise<Response> => {
    const pathname = new URL(req.url).pathname;
    switch(req.method) {
        case "POST":
            if (pathname === "/api/v1/create-room") return roomCreated(roomManager.createRoom());
            return notFound;
        case "GET":
            if  (roomWsConnectPattern.test(req.url)) {
                const roomId: string | undefined = roomWsConnectPattern.exec(req.url)?.pathname.groups.id;

                if (roomId == null || !roomManager.doesRoomExist(roomId)) {
                    return notFound;
                }

                const { user, response } = await createUser(req, connInfo, {
                    onJoin: () => roomManager.joinRoom(roomId, user),
                    onLeave: () => roomManager.leaveRoom(roomId, user)
                });

                return response;
            }
            return notFound;
        default:
            return notFound;
    }
}

serve(handle, {port: 8001});