from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    and_,
    CheckConstraint,
    Computed,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    JSON,
    Numeric,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, foreign, mapped_column, relationship

from app.db.base import Base


class Site(Base):
    __tablename__ = "sites"
    __table_args__ = (
        CheckConstraint("length(trim(name)) > 0", name="name_not_empty"),
        CheckConstraint("length(trim(timezone)) > 0", name="timezone_not_empty"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    location: Mapped[str | None] = mapped_column(Text)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC", server_default=text("'UTC'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    machines: Mapped[list[Machine]] = relationship(back_populates="site")


class Machine(Base):
    __tablename__ = "machines"
    __table_args__ = (
        UniqueConstraint("site_id", "machine_identifier", name="uq_machines_site_identifier"),
        CheckConstraint("length(trim(machine_identifier)) > 0", name="machine_identifier_not_empty"),
        CheckConstraint("length(trim(name)) > 0", name="name_not_empty"),
        CheckConstraint("rated_power_kw IS NULL OR rated_power_kw > 0", name="rated_power_positive"),
        CheckConstraint(
            "status IN ('active', 'inactive', 'maintenance', 'decommissioned')", name="status_valid"
        ),
        Index("ix_machines_site_status", "site_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    site_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("sites.id", ondelete="RESTRICT"), nullable=False
    )
    machine_identifier: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    machine_type: Mapped[str] = mapped_column(String(100), nullable=False)
    manufacturer: Mapped[str | None] = mapped_column(String(200))
    model: Mapped[str | None] = mapped_column(String(200))
    rated_power_kw: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active", server_default=text("'active'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    site: Mapped[Site] = relationship(back_populates="machines")
    sensors: Mapped[list[Sensor]] = relationship(back_populates="machine")
    telemetry: Mapped[list[Telemetry]] = relationship(back_populates="machine")
    events: Mapped[list[MachineEvent]] = relationship(back_populates="machine")
    alerts: Mapped[list[Alert]] = relationship(back_populates="machine")
    energy_wastage_events: Mapped[list[EnergyWastageEvent]] = relationship(back_populates="machine")
    corrective_actions: Mapped[list[CorrectiveAction]] = relationship(back_populates="machine", cascade="all, delete-orphan")
    health_warnings: Mapped[list[MachineHealthWarning]] = relationship(back_populates="machine", cascade="all, delete-orphan")
    maintenance_observations: Mapped[list[MaintenanceObservation]] = relationship(back_populates="machine", cascade="all, delete-orphan")


class Sensor(Base):
    __tablename__ = "sensors"
    __table_args__ = (
        UniqueConstraint("machine_id", "sensor_identifier", name="uq_sensors_machine_identifier"),
        UniqueConstraint("machine_id", "id", name="uq_sensors_machine_id"),
        CheckConstraint("length(trim(sensor_identifier)) > 0", name="sensor_identifier_not_empty"),
        CheckConstraint("length(trim(sensor_type)) > 0", name="sensor_type_not_empty"),
        CheckConstraint("length(trim(unit)) > 0", name="unit_not_empty"),
        CheckConstraint("status IN ('active', 'inactive', 'faulty', 'maintenance')", name="status_valid"),
        Index("ix_sensors_machine_status", "machine_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("machines.id", ondelete="RESTRICT"), nullable=False
    )
    sensor_identifier: Mapped[str] = mapped_column(String(128), nullable=False)
    sensor_type: Mapped[str] = mapped_column(String(100), nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    installation_info: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active", server_default=text("'active'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    machine: Mapped[Machine] = relationship(back_populates="sensors")
    telemetry: Mapped[list[Telemetry]] = relationship(
        back_populates="sensor",
        primaryjoin=lambda: and_(
            Sensor.machine_id == Telemetry.machine_id,
            Sensor.id == foreign(Telemetry.sensor_id),
        ),
        foreign_keys=lambda: [Telemetry.sensor_id],
    )


class Telemetry(Base):
    __tablename__ = "telemetry"
    __table_args__ = (
        PrimaryKeyConstraint("timestamp", "id", name="pk_telemetry"),
        ForeignKeyConstraint(["machine_id"], ["machines.id"], ondelete="RESTRICT", name="fk_telemetry_machine"),
        ForeignKeyConstraint(
            ["machine_id", "sensor_id"],
            ["sensors.machine_id", "sensors.id"],
            ondelete="RESTRICT",
            name="fk_telemetry_sensor_machine",
        ),
        CheckConstraint("voltage IS NULL OR voltage >= 0", name="voltage_nonnegative"),
        CheckConstraint("current IS NULL OR current >= 0", name="current_nonnegative"),
        CheckConstraint("apparent_power IS NULL OR apparent_power >= 0", name="apparent_power_nonnegative"),
        CheckConstraint("power_factor IS NULL OR power_factor BETWEEN -1 AND 1", name="power_factor_range"),
        CheckConstraint("cumulative_energy IS NULL OR cumulative_energy >= 0", name="energy_nonnegative"),
        CheckConstraint("rpm IS NULL OR rpm >= 0", name="rpm_nonnegative"),
        CheckConstraint("load_percentage IS NULL OR load_percentage BETWEEN 0 AND 100", name="load_percentage_range"),
        Index("ix_telemetry_machine_time", "machine_id", text("timestamp DESC")),
        Index("ix_telemetry_sensor_time", "sensor_id", text("timestamp DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    machine_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    sensor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True))
    voltage: Mapped[float | None] = mapped_column(Float)
    current: Mapped[float | None] = mapped_column(Float)
    active_power: Mapped[float | None] = mapped_column(Float)
    reactive_power: Mapped[float | None] = mapped_column(Float)
    apparent_power: Mapped[float | None] = mapped_column(Float)
    power_factor: Mapped[float | None] = mapped_column(Float)
    cumulative_energy: Mapped[float | None] = mapped_column(Float)
    rpm: Mapped[float | None] = mapped_column(Float)
    temperature: Mapped[float | None] = mapped_column(Float)
    load_percentage: Mapped[float | None] = mapped_column(Float)
    operating_state: Mapped[str | None] = mapped_column(String(32))

    machine: Mapped[Machine] = relationship(back_populates="telemetry")
    sensor: Mapped[Sensor | None] = relationship(
        back_populates="telemetry",
        primaryjoin=lambda: and_(
            Sensor.machine_id == Telemetry.machine_id,
            Sensor.id == foreign(Telemetry.sensor_id),
        ),
        foreign_keys=lambda: [Telemetry.sensor_id],
    )


class MachineEvent(Base):
    __tablename__ = "machine_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('machine_started', 'machine_stopped', 'machine_idle', "
            "'machine_returned_to_operation', 'abnormal_condition')",
            name="event_type_valid",
        ),
        Index("ix_machine_events_machine_time", "machine_id", text("occurred_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("machines.id", ondelete="RESTRICT"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(48), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    event_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    machine: Mapped[Machine] = relationship(back_populates="events")


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        CheckConstraint("length(trim(alert_type)) > 0", name="alert_type_not_empty"),
        CheckConstraint("severity IN ('info', 'low', 'medium', 'high', 'critical')", name="severity_valid"),
        CheckConstraint("status IN ('open', 'acknowledged', 'resolved', 'dismissed')", name="status_valid"),
        CheckConstraint("(status = 'resolved') = (resolved_at IS NOT NULL)", name="resolved_at_consistent"),
        Index("ix_alerts_machine_time", "machine_id", text("occurred_at DESC")),
        Index("ix_alerts_status_time", "status", text("occurred_at DESC")),
        Index("ix_alerts_event_id", "event_id", unique=True, postgresql_where=text("event_id IS NOT NULL")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("machines.id", ondelete="RESTRICT"), nullable=False
    )
    alert_type: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open", server_default=text("'open'"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    event_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("energy_wastage_events.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)

    machine: Mapped[Machine] = relationship(back_populates="alerts")
    wastage_event: Mapped[EnergyWastageEvent | None] = relationship(back_populates="alert", foreign_keys=[event_id])


class EnergyWastageEvent(Base):
    __tablename__ = "energy_wastage_events"
    __table_args__ = (
        CheckConstraint("end_time IS NULL OR end_time >= start_time", name="time_order_valid"),
        CheckConstraint("estimated_energy_kwh >= 0", name="estimated_energy_nonnegative"),
        CheckConstraint("estimated_wasted_energy_kwh >= 0", name="wasted_energy_nonnegative"),
        CheckConstraint(
            "estimated_wasted_energy_kwh <= estimated_energy_kwh", name="wasted_energy_within_total"
        ),
        CheckConstraint("confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1", name="confidence_range"),
        CheckConstraint("length(trim(detection_reason)) > 0", name="detection_reason_not_empty"),
        CheckConstraint("status IN ('detected', 'confirmed', 'dismissed', 'resolved')", name="status_valid"),
        Index("ix_energy_wastage_machine_start", "machine_id", text("start_time DESC")),
        Index("ix_energy_wastage_status_start", "status", text("start_time DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("machines.id", ondelete="RESTRICT"), nullable=False
    )
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[float | None] = mapped_column(
        Float, Computed("EXTRACT(EPOCH FROM (end_time - start_time))", persisted=True)
    )
    estimated_energy_kwh: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    estimated_wasted_energy_kwh: Mapped[Decimal | None] = mapped_column(Numeric(14, 4), nullable=True)
    detection_reason: Mapped[str] = mapped_column(Text, nullable=False)
    confidence_score: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="detected", server_default=text("'detected'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    machine: Mapped[Machine] = relationship(back_populates="energy_wastage_events")
    alert: Mapped[Alert | None] = relationship(back_populates="wastage_event", uselist=False)

class CorrectiveAction(Base):
    __tablename__ = "corrective_actions"
    __table_args__ = (
        CheckConstraint("length(trim(action_type)) > 0", name="action_type_not_empty"),
        CheckConstraint("length(trim(title)) > 0", name="title_not_empty"),
        Index("ix_corrective_actions_machine_time", "machine_id", text("performed_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("machines.id", ondelete="CASCADE"), nullable=False
    )
    action_type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    operator_name: Mapped[str | None] = mapped_column(String(128))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    machine: Mapped[Machine] = relationship(back_populates="corrective_actions")


class MachineHealthWarning(Base):
    __tablename__ = "machine_health_warnings"
    __table_args__ = (
        CheckConstraint("length(trim(warning_type)) > 0", name="warning_type_not_empty"),
        CheckConstraint("severity IN ('NORMAL', 'WATCH', 'WARNING', 'CRITICAL')", name="warning_severity_valid"),
        CheckConstraint("status IN ('open', 'acknowledged', 'resolved')", name="warning_status_valid"),
        CheckConstraint("confidence_score BETWEEN 0 AND 1", name="warning_confidence_range"),
        CheckConstraint("length(trim(severity_rationale)) > 0", name="severity_rationale_not_empty"),
        CheckConstraint("length(trim(recommended_action)) > 0", name="recommended_action_not_empty"),
        Index("ix_machine_health_warnings_machine_time", "machine_id", text("detected_at DESC")),
        Index("ix_machine_health_warnings_status", "status"),
        Index("ix_machine_health_warnings_type_status", "machine_id", "warning_type", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("machines.id", ondelete="CASCADE"), nullable=False
    )
    warning_type: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open", server_default=text("'open'"))
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    window_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    observed_value: Mapped[float] = mapped_column(Float, nullable=False)
    baseline_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    threshold_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    severity_rationale: Mapped[str] = mapped_column(Text, nullable=False)
    telemetry_evidence: Mapped[dict[str, Any]] = mapped_column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    data_quality: Mapped[str] = mapped_column(String(32), nullable=False, default="HIGH")
    recommended_action: Mapped[str] = mapped_column(Text, nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    machine: Mapped[Machine] = relationship(back_populates="health_warnings")
    observations: Mapped[list[MaintenanceObservation]] = relationship(back_populates="linked_warning")


class MaintenanceObservation(Base):
    __tablename__ = "maintenance_observations"
    __table_args__ = (
        CheckConstraint("length(trim(inspector_name)) > 0", name="inspector_name_not_empty"),
        CheckConstraint("length(trim(suspected_issue)) > 0", name="suspected_issue_not_empty"),
        CheckConstraint("status IN ('open', 'acknowledged', 'resolved')", name="observation_status_valid"),
        Index("ix_maintenance_observations_machine_time", "machine_id", text("inspection_date DESC")),
        Index("ix_maintenance_observations_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("machines.id", ondelete="CASCADE"), nullable=False
    )
    warning_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("machine_health_warnings.id", ondelete="SET NULL"), nullable=True
    )
    inspector_name: Mapped[str] = mapped_column(String(128), nullable=False)
    inspection_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    suspected_issue: Mapped[str] = mapped_column(String(255), nullable=False)
    corrective_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open", server_default=text("'open'"))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    machine: Mapped[Machine] = relationship(back_populates="maintenance_observations")
    linked_warning: Mapped[MachineHealthWarning | None] = relationship(back_populates="observations")
