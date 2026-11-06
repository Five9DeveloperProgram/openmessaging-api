# Five9 Open Messaging API demo

A Postman walkthrough for creating a chat and sending customer messages into
Five9. No website or demo server is included or required to run the collection.
Your Five9 delivery configuration still controls outbound delivery and webhooks.

## Files and documentation

- [Demo-ready Postman collection](./Open%20Messaging%20API.postman_collection.json)
- [Five9 Open Messaging API reference](https://documentation.five9.com/bundle/open-messaging-api/page/index.html)
- [Download the OpenAPI YAML specification](https://documentation-be.five9.com/bundle/open-messaging-api/page/open-messaging-api.yaml)
- [Open Messaging configuration guide](https://documentation.five9.com/bundle/admin-console/page/admin-console/open-messaging/open-messaging-intro.htm)
- [Configuring API Access Control](https://documentation.five9.com/bundle/admin-console/page/admin-console/api-access-control/api-access-control.htm)

Use the JSON collection for the demo. Importing the YAML into Postman generates
API requests, but does not include this collection's demo payloads, ordering,
variable checks, or automatic ID capture.

The specification is hosted by Five9 rather than bundled in this repository.
A local download named `open-messaging-api.yaml` is ignored by Git.

## Prerequisites

- Postman with support for `pm.execution.skipRequest()`.
- A Five9 test domain with Open Messaging enabled and API access configured.
- An appropriate messaging campaign and delivery profile.
- An available agent if you want to demonstrate routing and agent replies.

Open Messaging requires a license and may incur consumption-based charges.
Use synthetic customer information for demonstrations.

## Setup

1. Download and import the [JSON collection](./Open%20Messaging%20API.postman_collection.json)
   into Postman.
2. Open the collection's **Variables** tab and configure:

   | Variable | Value |
   | --- | --- |
   | `baseUrl` | API origin for your region/environment, without a trailing slash. See the [hosted YAML specification](https://documentation-be.five9.com/bundle/open-messaging-api/page/open-messaging-api.yaml)'s `servers` list. |
   | `domainId` | Your test domain ID. |
   | `campaignName` | Exact name of the messaging campaign. Replaces the old `chatCampaignName` variable. |
   | `deliveryProfileId` | Your configured delivery profile ID. |
   | `authSecret` | Your API secret, kept local. |
   | `authKey` | Your API key, kept local. |
   | `channel` | Defaults to `GENERIC`; must match your campaign/profile configuration. |

3. Optionally customize `clientHandle`, `subject`, `question`, and `messageText`.
   The subject and question provide chat context; **Add a message to a chat**
   sends the customer message.
4. Send **00 - Authentication / authentication**. A successful response saves
   `bearerToken` automatically. The request preserves the original collection's
   Basic authentication convention: `base64(authSecret:authKey)`.
   Alternatively, set a valid `bearerToken` locally and skip authentication.

Use collection variables for this walkthrough. Remove conflicting values from
active environments and Runner data files so they do not override the settings
or captured IDs.

## Run the demo

Run **only the `01 - Text chat demo` folder**, or send its requests individually
in order:

1. **Create a new chat** - captures `chatId` and the USER participant ID.
2. **Retrieve chat details** - inspect the chat and refresh the participant ID.
3. **Show typing indicator**.
4. **Add a message to a chat** - sends `messageText` and captures `messageId`.
5. **List all messages in a chat** - inspect the conversation.
6. **Retrieve a chat message** - inspect the customer message just sent.
7. **Retrieve chat interaction history**.

Have the agent reply in Five9, then send **List all messages in a chat** again
to inspect available messages. Change `messageText` and repeat **Add a message
to a chat** to continue. There is no automatic polling or webhook listener.

If Five9 has not returned a USER participant, retrieve chat details again.
You can also set `sourceParticipantId` manually from the USER participant in
that response; do not use an agent participant ID.

### End the chat

Set `allowDestructiveActions` to `true`, then send **05 - Edit and cleanup
(manual) / Terminate chat**. Expect HTTP 204. Successful termination clears
the runtime IDs and resets the opt-in to `false`.

Creating another chat does not terminate the previous one. End the previous
chat first to avoid leaving demo sessions open.

## Delivery profiles and webhooks

The delivery method and postback destination configured in Five9 determine
where outbound messages and events are delivered. The collection does not
change that configuration or implement a receiver.

Configure your endpoint according to the
[Five9 Open Messaging documentation](https://documentation.five9.com/bundle/admin-console/page/admin-console/open-messaging/open-messaging-intro.htm).
A successful API request is not, by itself, proof that an outbound message
was delivered or read by a customer.

## Optional requests

Do **not** run the whole collection as a single sequence:

- **02 - Optional inspection:** retrieve chat extensions.
- **03 - Optional attachments:** create attachment metadata and inspect it.
  Creating metadata does not upload content; follow the upload instructions
  inside the request before referencing the attachment in a message.
- **04 - Optional outbound acknowledgments:** set `outboundMessageId` from a
  real outbound message or webhook event. Send only the acknowledgment matching
  the actual delivery state, not every request in this folder.
- **05 - Edit and cleanup (manual):** update/delete messages or terminate a chat.
  These actions require `allowDestructiveActions=true`; reset it afterwards.

## Troubleshooting

- **Missing variable:** configure the named collection variable, or run the
  authentication/create-chat step that supplies it.
- **Variable override:** remove the conflicting environment or Runner value.
- **HTTP 401:** authenticate again.
- **HTTP 403:** check API access permissions and the selected domain.
- **HTTP 400:** inspect the response and verify the campaign, delivery profile,
  channel, and request values.

## Before sharing

Never commit or share populated credentials, `authEncoded`, bearer tokens, or
signed upload URLs, even for a test tenant. Review exported collection values
and saved response examples for sensitive information before publishing.

## Local validation

The [collection tests](./collection.test.cjs) check request wiring and execute
scripts with simulated Postman inputs and API responses. With a recent Node.js:

```sh
node --test collection.test.cjs
```

These are local regression checks, not a live Five9 integration test or a
replacement for a walkthrough in Postman against your configured test domain.
