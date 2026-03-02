"""
Pydantic models for Chat Messages.
Supports all WhatsApp content types for the chat mirror feature.
"""

from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from typing import Optional, Any


class ContentType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    DOCUMENT = "document"
    STICKER = "sticker"
    REACTION = "reaction"
    LOCATION = "location"
    CONTACT = "contact"


class MessageDirection(str, Enum):
    INCOMING = "incoming"
    OUTGOING = "outgoing"


class ChatMessageResponse(BaseModel):
    id: str
    lead_id: Optional[str] = None
    whatsapp_chat_id: str
    whatsapp_message_id: Optional[str] = None
    direction: MessageDirection
    content_type: ContentType = ContentType.TEXT
    content: Optional[str] = None
    media_url: Optional[str] = None
    media_mimetype: Optional[str] = None
    media_filename: Optional[str] = None
    caption: Optional[str] = None
    quoted_message_id: Optional[str] = None
    sender_name: Optional[str] = None
    sender_phone: Optional[str] = None
    metadata: dict = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatConversation(BaseModel):
    """Full conversation for a lead, used in the chat mirror panel."""
    lead_id: str
    lead_name: str
    whatsapp_chat_id: str
    messages: list[ChatMessageResponse]
    total_messages: int


class SendMessagePayload(BaseModel):
    """Payload for sending a message from the CRM to a WhatsApp contact."""
    text: Optional[str] = Field(None, max_length=4096, description="Texto da mensagem")
    media_type: Optional[str] = Field(
        None,
        description="Tipo de mídia: image, video, document, audio, ptt",
        pattern="^(image|video|document|audio|ptt|sticker)$",
    )
    file_url: Optional[str] = Field(None, description="URL do arquivo de mídia")
    file_name: Optional[str] = Field(None, description="Nome do arquivo (para documentos)")

    def validate_payload(self):
        if not self.text and not self.file_url:
            raise ValueError("Envie 'text' ou 'file_url' (ou ambos).")
        if self.file_url and not self.media_type:
            raise ValueError("Quando enviar mídia, 'media_type' é obrigatório.")
        if self.media_type and not self.file_url:
            raise ValueError("Quando definir 'media_type', 'file_url' é obrigatório.")
