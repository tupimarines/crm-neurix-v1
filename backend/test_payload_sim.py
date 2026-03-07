event = {
    "source": "uazapi",
    "payload": {
        "BaseUrl": "https://neurix.uazapi.com",
        "EventType": "messages",
        "chat": {
            "id": "r1bcc7fa04faee3",
            "name": "Augusto",
            "phone": "+55 41 9580-2989",
            "wa_chatid": "554195802989@s.whatsapp.net",
            "wa_contactName": "Augusto",
            "wa_isGroup": False
        },
        "instanceName": "crm_neurix-9864",
        "message": {
            "chatid": "554195802989@s.whatsapp.net",
            "content": "ola",
            "fromMe": False,
            "isGroup": False,
            "messageType": "Conversation",
            "senderName": "Augusto",
            "sender_pn": "554195802989@s.whatsapp.net",
            "text": "ola",
            "type": "text",
            "wasSentByApi": False,
            "messageid": "3EB024AE112ADF2BEF7817"
        }
    }
}

def simulate():
    payload = event.get("payload", {})
    
    print("EventType:", payload.get("EventType"))
    
    if payload.get("EventType") == "messages":
        message_data = payload.get("message", {})
        chat_id = message_data.get("chatid", "")
        msg_id = message_data.get("messageid", "")
        is_from_me = message_data.get("fromMe", False)
        
        print(f"chat_id: {chat_id}")
        
        # Ignore invalid or group chats
        if not chat_id or "@g.us" in chat_id or message_data.get("isGroup"):
            print("Returned early: Invalid or group chat")
            return
            
        content_type = message_data.get("type", "text")
        content_text = message_data.get("text", message_data.get("content", ""))
        media_url = None # Needs adaptation if Uazapi v2 sends file urls differently
        media_mimetype = message_data.get("mediaType", None)
        media_filename = None
        
        sender_name = message_data.get("senderName", "")
        sender_phone = chat_id.replace("@s.whatsapp.net", "").replace("@g.us", "")
        
        print("Success extracting:")
        print("type:", content_type)
        print("text:", content_text)
        print("sender:", sender_name, sender_phone)
        print("fromMe:", is_from_me)

simulate()
