import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Update or delete commission rule
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      name,
      rule_type,
      applies_to,
      value,
      max_payments,
      max_months,
      selling_plan_ids,
      active,
    } = await request.json();

    const rule = await prisma.commissionRule.findFirst({
      where: {
        id: params.id,
        shopify_shop_id: admin.shopify_shop_id,
      },
    });

    if (!rule) {
      return NextResponse.json(
        { error: 'Commission rule not found' },
        { status: 404 }
      );
    }

    const updated = await prisma.commissionRule.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
        ...(rule_type && { rule_type }),
        ...(applies_to && { applies_to }),
        ...(value !== undefined && { value: parseFloat(value) }),
        ...(max_payments !== undefined && { max_payments: max_payments ? parseInt(max_payments) : null }),
        ...(max_months !== undefined && { max_months: max_months ? parseInt(max_months) : null }),
        ...(selling_plan_ids !== undefined && {
          selling_plan_ids: selling_plan_ids && Array.isArray(selling_plan_ids)
            ? JSON.stringify(selling_plan_ids)
            : null,
        }),
        ...(active !== undefined && { active }),
      },
    });

    return NextResponse.json({
      success: true,
      rule: updated,
    });
  } catch (error: any) {
    console.error('Error updating commission rule:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update commission rule' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rule = await prisma.commissionRule.findFirst({
      where: {
        id: params.id,
        shopify_shop_id: admin.shopify_shop_id,
      },
    });

    if (!rule) {
      return NextResponse.json(
        { error: 'Commission rule not found' },
        { status: 404 }
      );
    }

    await prisma.commissionRule.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Commission rule deleted',
    });
  } catch (error: any) {
    console.error('Error deleting commission rule:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete commission rule' },
      { status: 500 }
    );
  }
}