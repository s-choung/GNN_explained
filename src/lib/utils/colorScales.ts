import * as d3 from 'd3';

export const featureColorScale = d3.scaleSequential(d3.interpolateRdBu).domain([1, -1]);

export const gateColorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 1]);

export const contributionColorScale = d3.scaleSequential(d3.interpolateGreens).domain([0, 0.3]);

export const elementColors: Record<string, string> = {
	Sr: '#f472b6',
	Ti: '#60a5fa',
	O: '#f87171',
	C: '#a3a3a3',
	H: '#fafafa',
	N: '#60a5fa',
	Fe: '#fb923c',
	Si: '#a78bfa'
};

export const elementRadii: Record<string, number> = {
	Sr: 18,
	Ti: 16,
	O: 12,
	C: 14,
	H: 8,
	N: 12,
	Fe: 16,
	Si: 16
};
