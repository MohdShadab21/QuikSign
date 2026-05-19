import { prisma } from "@/db/prisma";
import { hashSigningToken } from "@/lib/utils/tokens";
import {
  createSigningPresetSchema,
  deleteSigningPresetSchema,
  setDefaultSigningPresetSchema,
  signingPresetQuerySchema,
  updateSigningPresetSchema,
} from "@/lib/validations/envelope";
import { NextRequest, NextResponse } from "next/server";

async function getSignerByToken(token: string) {
  const tokenHash = hashSigningToken(token);
  const envelope = await prisma.envelope.findFirst({
    where: {
      signingTokenHash: tokenHash,
      tokenExpiresAt: { gte: new Date() },
    },
    include: {
      signers: {
        orderBy: { signingOrder: "asc" },
      },
    },
  });
  if (!envelope) {
    return null;
  }
  const signer = envelope.signers.find(
    (entry) => (entry.status === "PENDING" || entry.status === "VIEWED") && entry.role !== "CC",
  );
  if (!signer) {
    return null;
  }
  return {
    signer,
    orgId: envelope.orgId ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token") ?? "";
    const parsed = signingPresetQuerySchema.safeParse({ token });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const session = await getSignerByToken(parsed.data.token);
    if (!session) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    const presets = await prisma.signingPreset.findMany({
      where: { ownerEmail: session.signer.email.toLowerCase() },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      take: 10,
      select: {
        id: true,
        label: true,
        isDefault: true,
        signatureValue: true,
        initialValue: true,
        sealValue: true,
        fontStyle: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ presets });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const parsed = createSigningPresetSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const session = await getSignerByToken(parsed.data.token);
    if (!session) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    const ownerEmail = session.signer.email.toLowerCase();
    const label = parsed.data.label.trim();
    const existing = await prisma.signingPreset.findUnique({
      where: { ownerEmail_label: { ownerEmail, label } },
      select: { id: true, isDefault: true, signatureValue: true, initialValue: true, sealValue: true, fontStyle: true },
    });

    const incomingSignature = parsed.data.signatureValue?.trim() || null;
    const incomingInitial = parsed.data.initialValue?.trim() || null;
    const incomingSeal = parsed.data.sealValue?.trim() || null;
    const incomingFont = parsed.data.fontStyle?.trim() || null;

    const saved = await prisma.signingPreset.upsert({
      where: { ownerEmail_label: { ownerEmail, label } },
      update: {
        signatureValue: incomingSignature ?? existing?.signatureValue ?? null,
        initialValue: incomingInitial ?? existing?.initialValue ?? null,
        sealValue: incomingSeal ?? existing?.sealValue ?? null,
        fontStyle: incomingFont ?? existing?.fontStyle ?? null,
        ownerName: session.signer.name,
        orgId: session.orgId,
      },
      create: {
        ownerEmail,
        ownerName: session.signer.name,
        orgId: session.orgId,
        label,
        isDefault: false,
        signatureValue: incomingSignature,
        initialValue: incomingInitial,
        sealValue: incomingSeal,
        fontStyle: incomingFont,
      },
      select: {
        id: true,
        label: true,
        isDefault: true,
        signatureValue: true,
        initialValue: true,
        sealValue: true,
        fontStyle: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ preset: saved }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = await request.json();
    const parsed = updateSigningPresetSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const session = await getSignerByToken(parsed.data.token);
    if (!session) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    const ownerEmail = session.signer.email.toLowerCase();
    const existing = await prisma.signingPreset.findUnique({
      where: { id: parsed.data.presetId },
      select: { id: true, ownerEmail: true },
    });
    if (!existing || existing.ownerEmail !== ownerEmail) {
      return NextResponse.json({ error: "Preset not found." }, { status: 404 });
    }

    const renamed = await prisma.signingPreset.update({
      where: { id: parsed.data.presetId },
      data: { label: parsed.data.label.trim() },
      select: {
        id: true,
        label: true,
        isDefault: true,
        signatureValue: true,
        initialValue: true,
        sealValue: true,
        fontStyle: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ preset: renamed });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const payload = await request.json();
    const parsed = deleteSigningPresetSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const session = await getSignerByToken(parsed.data.token);
    if (!session) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    const ownerEmail = session.signer.email.toLowerCase();
    const existing = await prisma.signingPreset.findUnique({
      where: { id: parsed.data.presetId },
      select: { id: true, ownerEmail: true },
    });
    if (!existing || existing.ownerEmail !== ownerEmail) {
      return NextResponse.json({ error: "Preset not found." }, { status: 404 });
    }

    await prisma.signingPreset.delete({ where: { id: parsed.data.presetId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await request.json();
    const parsed = setDefaultSigningPresetSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const session = await getSignerByToken(parsed.data.token);
    if (!session) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }
    const ownerEmail = session.signer.email.toLowerCase();
    const existing = await prisma.signingPreset.findUnique({
      where: { id: parsed.data.presetId },
      select: { id: true, ownerEmail: true },
    });
    if (!existing || existing.ownerEmail !== ownerEmail) {
      return NextResponse.json({ error: "Preset not found." }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.signingPreset.updateMany({
        where: { ownerEmail },
        data: { isDefault: false },
      });
      await tx.signingPreset.update({
        where: { id: parsed.data.presetId },
        data: { isDefault: true },
      });
    });

    const presets = await prisma.signingPreset.findMany({
      where: { ownerEmail },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      take: 10,
      select: {
        id: true,
        label: true,
        isDefault: true,
        signatureValue: true,
        initialValue: true,
        sealValue: true,
        fontStyle: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ presets });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
