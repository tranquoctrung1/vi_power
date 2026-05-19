import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

// Tooltip style + animation (applies globally; works when animation:{duration:0} used per-chart)
Chart.defaults.plugins.tooltip.animation = { duration: 200 } as never;
Chart.defaults.plugins.tooltip.backgroundColor = '#111c2b';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(56,139,253,0.28)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.titleColor = '#607b99';
Chart.defaults.plugins.tooltip.bodyColor = '#e6eef8';
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
