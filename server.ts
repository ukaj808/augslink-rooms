import {serve} from "https://deno.land/std@0.136.0/http/server.ts";

const handle = (): Response => {
        return new Response("hello world", {
            status: 200,
        });
}

serve(handle);