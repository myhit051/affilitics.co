-- ฟังก์ชัน Transform (ย่อ) จาก stg_shopee_aff → affiliate_orders
CREATE OR REPLACE FUNCTION transform_shopee_aff(p_workspace uuid, p_job uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- upsert order จาก staging
  INSERT INTO affiliate_orders (workspace_id, platform, order_id, subid, event_date, amount, net, commission)
  SELECT
    s.workspace_id,
    'shopee'::text,
    coalesce(s.order_id, (s.raw->>'order_id')),
    coalesce(s.subid, (s.raw->>'subid')),
    (s.order_time)::date,
    s.amount,
    s.net,
    s.commission
  FROM stg_shopee_aff s
  WHERE s.workspace_id = p_workspace AND s.source_job_id = p_job
  ON CONFLICT (workspace_id, platform, order_id)
  DO UPDATE SET
    subid = EXCLUDED.subid,
    event_date = EXCLUDED.event_date,
    amount = EXCLUDED.amount,
    net = EXCLUDED.net,
    commission = EXCLUDED.commission;

END $$;

-- Refresh metrics_daily สำหรับช่วงวันที่ของไฟล์
CREATE OR REPLACE FUNCTION refresh_metrics_daily(p_workspace uuid, p_date_from date, p_date_to date)
RETURNS void LANGUAGE sql AS $$
  DELETE FROM metrics_daily
  WHERE workspace_id = p_workspace AND date BETWEEN p_date_from AND p_date_to;

  INSERT INTO metrics_daily (workspace_id, date, platform, subid, orders, revenue, commission)
  SELECT
    o.workspace_id,
    o.event_date AS date,
    o.platform,
    o.subid,
    COUNT(*) AS orders,
    COALESCE(SUM(o.net), 0) AS revenue,
    COALESCE(SUM(o.commission), 0) AS commission
  FROM affiliate_orders o
  WHERE o.workspace_id = p_workspace AND o.event_date BETWEEN p_date_from AND p_date_to
  GROUP BY 1,2,3,4;
$$;
