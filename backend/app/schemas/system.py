"""Schemas for application liveness and service identity endpoints."""

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(examples=["healthy"])


class RootResponse(BaseModel):
    service: str
    version: str
    environment: str
    docs: str = Field(default="/docs")
