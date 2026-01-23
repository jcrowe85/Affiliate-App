import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Get all commission rules or create new rule
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rules = await prisma.commissionRule.findMany({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return NextResponse.json({
      rules: rules.map(r => ({
        id: r.id,
        name: r.name,
        rule_type: r.rule_type,
        applies_to: r.applies_to,
        value: r.value.toString(),
        max_payments: r.max_payments,
        max_months: r.max_months,
        selling_plan_ids: r.selling_plan_ids ? JSON.parse(r.selling_plan_ids as string) : null,
        active: r.active,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching commission rules:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch commission rules' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    if (!name || !rule_type || !applies_to || value === undefined) {
      return NextResponse.json(
        { error: 'name, rule_type, applies_to, and value are required' },
        { status: 400 }
      );
    }

    const rule = await prisma.commissionRule.create({
      data: {
        name,
        rule_type,
        applies_to,
        value: parseFloat(value),
        max_payments: max_payments ? parseInt(max_payments) : null,
        max_months: max_months ? parseInt(max_months) : null,
        selling_plan_ids: selling_plan_ids && Array.isArray(selling_plan_ids) 
          ? JSON.stringify(selling_plan_ids) 
          : null,
        active: active !== undefined ? active : true,
        shopify_shop_id: admin.shopify_shop_id,
      },
    });

    return NextResponse.json({
      success: true,
      rule: {
        id: rule.id,
        name: rule.name,
        rule_type: rule.rule_type,
        applies_to: rule.applies_to,
        value: rule.value.toString(),
        max_payments: rule.max_payments,
        max_months: rule.max_months,
        active: rule.active,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating commission rule:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create commission rule' },
      { status: 500 }
    );
  }
}