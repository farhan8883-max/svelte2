<script>
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<!-- <link rel="icon" href={favicon} /> -->
	 <link rel="icon" href="/logo.png" />
    <title>Daarulhikam</title>
</svelte:head>

{@render children?.()}
