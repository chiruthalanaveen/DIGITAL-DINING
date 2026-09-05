import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-orange-500 selection:text-white scroll-smooth">
      
      {/* Top Promotional Banner (1 Month Free Trial Announcement) */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500 text-neutral-950 px-4 py-2 text-center text-xs font-black tracking-wider uppercase shadow-md flex items-center justify-center space-x-2">
        <span>🎉 Special Launch Offer: 1 Month Free Subscription for All First-Time Partner Restaurants! Claim Yours Today! 🚀</span>
      </div>

      {/* Top Navbar */}
      <header className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center border-b border-neutral-900 sticky top-0 bg-neutral-950/80 backdrop-blur-md z-30">
        <div className="flex items-center space-x-2">
          <span className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center font-black text-white text-sm shadow-lg shadow-orange-500/20">D</span>
          <span className="font-black text-lg tracking-tight">Digital Dining</span>
        </div>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center space-x-6 text-xs font-bold text-neutral-400">
          <a href="#features" className="hover:text-white transition">Features</a>
          <a href="#pricing" className="hover:text-white transition">Pricing</a>
          <a href="#how-it-works" className="hover:text-white transition">How It Works</a>
          <a href="#about" className="hover:text-white transition">About</a>
          <a href="#contact" className="hover:text-white transition">Contact</a>
        </nav>

        <div className="flex items-center space-x-3">
          <Link 
            href="/register" 
            className="text-xs font-black bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-2.5 rounded-xl shadow-lg shadow-orange-500/20 transition hover:opacity-95"
          >
            Register Restaurant 🚀
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center space-y-6">
        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
          🎁 1 Month Free Trial Available for First-Time Partners
        </span>
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-tight">
          Empower Your Restaurant with <span className="text-orange-500">Digital Dining</span>
        </h1>
        <p className="text-sm sm:text-base text-neutral-400 max-w-xl mx-auto">
          Manage orders, instant automated UPI billing mandates, live kitchen queues, and Swiggy menu sync effortlessly.
        </p>

        <div className="pt-4 flex justify-center space-x-4">
          <Link 
            href="/register" 
            className="bg-orange-500 hover:bg-orange-600 text-white font-black px-6 py-3.5 rounded-2xl text-xs uppercase tracking-wider transition shadow-xl shadow-orange-500/25"
          >
            Get Started Free
          </Link>
          <Link 
            href="/login" 
            className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 font-bold px-6 py-3.5 rounded-2xl text-xs uppercase tracking-wider transition"
          >
            Partner Login ⎋
          </Link>
        </div>
      </main>

      {/* FEATURES SECTION */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20 border-t border-neutral-900 space-y-12 scroll-mt-20">
        <div className="text-center space-y-2">
          <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Powerful Capabilities</span>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Built for High-Performance Dining</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl space-y-3">
            <span className="text-2xl">🔥</span>
            <h3 className="font-bold text-white text-base">Live Kitchen Queue</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">Real-time order tracking with status updates (Pending, Preparing, Completed) and optional sound alerts for incoming tickets.</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl space-y-3">
            <span className="text-2xl">💳</span>
            <h3 className="font-bold text-white text-base">Flexible Payments</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">Integrated individual Razorpay gateway support alongside traditional cash and card options at the checkout counter.</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl space-y-3">
            <span className="text-2xl">🟠</span>
            <h3 className="font-bold text-white text-base">Swiggy Menu Sync</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">Direct JSON data importers let you synchronize your entire catalog from delivery aggregators in seconds.</p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 py-20 border-t border-neutral-900 space-y-12 scroll-mt-20">
        <div className="text-center space-y-2">
          <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Simple 3-Step Process</span>
          <h2 className="text-2xl sm:text-3xl font-black text-white">How Digital Dining Works</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl space-y-3">
            <span className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center font-black text-sm">01</span>
            <h3 className="font-bold text-white text-base">Onboard & Choose Plan</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">Register your store, link your Razorpay gateway credentials, and select your preferred membership tier.</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl space-y-3">
            <span className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center font-black text-sm">02</span>
            <h3 className="font-bold text-white text-base">Deploy QR & Menu Catalog</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">Generate unique table QR codes instantly and populate your menu catalog with items and add-ons.</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl space-y-3">
            <span className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center font-black text-sm">03</span>
            <h3 className="font-bold text-white text-base">Automate Live Orders & Reports</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">Receive live customer orders, manage kitchen queues, and review daily, weekly, monthly, or yearly financial statements.</p>
          </div>
        </div>
      </section>

      {/* PLANS & PRICING SECTION */}
      <section id="pricing" className="max-w-7xl mx-auto px-6 py-20 border-t border-neutral-900 space-y-12 scroll-mt-20">
        <div className="text-center space-y-2">
          <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Transparent SaaS Pricing</span>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Choose Your Restaurant Tier</h2>
          <p className="text-xs text-neutral-400">First-time restaurants get 1 month free. Enter your exclusive coupon code during registration to claim.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* STANDARD PLAN */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 flex flex-col justify-between space-y-6 shadow-xl">
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Starter Level</span>
                <h3 className="text-xl font-black text-white mt-1">Standard</h3>
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-3xl font-black text-white">₹499</span>
                <span className="text-xs text-neutral-400">/ month</span>
              </div>
              <p className="text-xs text-neutral-400">Essential digital catalog tools and cash payments for small outlets.</p>

              <div className="border-t border-neutral-800 pt-4 space-y-2.5 text-xs text-neutral-300 font-medium">
                <div className="flex items-center space-x-2"><span>✓</span><span>Up to 20 Menu Items Limit</span></div>
                <div className="flex items-center space-x-2"><span>✓</span><span>Max 2 Add-ons per Dish</span></div>
                <div className="flex items-center space-x-2"><span>✓</span><span>Razorpay Gateway & Pay at Counter</span></div>
                <div className="flex items-center space-x-2"><span>✓</span><span>Daily, Weekly & Monthly Reports</span></div>
                <div className="flex items-center space-x-2 opacity-40"><span>✕</span><span>Swiggy Menu Sync</span></div>
                <div className="flex items-center space-x-2 opacity-40"><span>✕</span><span>Real-Time Audio Order Alarms</span></div>
              </div>
            </div>

            <Link href="/register" className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-3 rounded-xl text-center text-xs uppercase tracking-wider transition">
              Get Standard
            </Link>
          </div>

          {/* PRO PLAN */}
          <div className="bg-neutral-900 border-2 border-orange-500 rounded-3xl p-8 flex flex-col justify-between space-y-6 shadow-2xl relative">
            <span className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-orange-500 text-white text-[9px] font-black uppercase px-3 py-1 rounded-full tracking-widest shadow">
              Most Popular
            </span>
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">Growth Level</span>
                <h3 className="text-xl font-black text-white mt-1">Pro</h3>
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-3xl font-black text-white">₹999</span>
                <span className="text-xs text-neutral-400">/ month</span>
              </div>
              <p className="text-xs text-neutral-400">Advanced tools for growing restaurants needing multi-platform syncing.</p>

              <div className="border-t border-neutral-800 pt-4 space-y-2.5 text-xs text-neutral-300 font-medium">
                <div className="flex items-center space-x-2"><span>✓</span><span>Up to 50 Menu Items Limit</span></div>
                <div className="flex items-center space-x-2"><span>✓</span><span>Max 5 Add-ons per Dish</span></div>
                <div className="flex items-center space-x-2"><span>✓</span><span>Razorpay Gateway & Pay at Counter</span></div>
                <div className="flex items-center space-x-2"><span>✓</span><span>Daily, Weekly & Monthly Reports</span></div>
                <div className="flex items-center space-x-2 text-orange-400 font-bold"><span>✓</span><span>Swiggy Menu Sync Enabled</span></div>
                <div className="flex items-center space-x-2 opacity-40"><span>✕</span><span>Real-Time Audio Order Alarms</span></div>
              </div>
            </div>

            <Link href="/register" className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-3 rounded-xl text-center text-xs uppercase tracking-wider transition shadow-lg shadow-orange-500/25">
              Get Pro 🚀
            </Link>
          </div>

          {/* PRO+ PLAN */}
          <div className="bg-neutral-900 border border-amber-500/50 rounded-3xl p-8 flex flex-col justify-between space-y-6 shadow-xl">
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Enterprise Level</span>
                <h3 className="text-xl font-black text-white mt-1">Pro+</h3>
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-3xl font-black text-white">₹1,399</span>
                <span className="text-xs text-neutral-400">/ month</span>
              </div>
              <p className="text-xs text-neutral-400">Complete enterprise automation with real-time sound alerts and audits.</p>

              <div className="border-t border-neutral-800 pt-4 space-y-2.5 text-xs text-neutral-300 font-medium">
                <div className="flex items-center space-x-2 text-amber-400 font-bold"><span>✓</span><span>Unlimited Menu Items</span></div>
                <div className="flex items-center space-x-2"><span>✓</span><span>Max 5 Add-ons per Dish</span></div>
                <div className="flex items-center space-x-2"><span>✓</span><span>Razorpay Gateway & Counter Payment</span></div>
                <div className="flex items-center space-x-2 text-amber-400 font-bold"><span>✓</span><span>Daily, Weekly, Monthly & Yearly Reports</span></div>
                <div className="flex items-center space-x-2"><span>✓</span><span>Swiggy Menu Sync Enabled</span></div>
                <div className="flex items-center space-x-2 text-amber-400 font-bold"><span>✓</span><span>Real-Time Sound Alarm & 3-Min Add-On Grace</span></div>
              </div>
            </div>

            <Link href="/register" className="w-full bg-amber-500 hover:bg-amber-600 text-neutral-950 font-black py-3 rounded-xl text-center text-xs uppercase tracking-wider transition">
              Get Pro+ 👑
            </Link>
          </div>

        </div>
      </section>

      {/* ABOUT SECTION */}
      <section id="about" className="max-w-4xl mx-auto px-6 py-20 border-t border-neutral-900 text-center space-y-6 scroll-mt-20">
        <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Our Mission</span>
        <h2 className="text-2xl sm:text-3xl font-black text-white">About Digital Dining</h2>
        <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
          Digital Dining is built to revolutionize restaurant operations by replacing outdated paper menus and disjointed billing systems with an intuitive, unified SaaS platform. From QR-code ordering to instant automated subscriptions, we empower restaurant owners to focus on what matters most: exceptional food and guest experience.
        </p>
      </section>

      {/* CONTACT SECTION */}
      <section id="contact" className="max-w-4xl mx-auto px-6 py-20 border-t border-neutral-900 text-center space-y-6 scroll-mt-20">
        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Get in Touch</span>
        <h2 className="text-2xl sm:text-3xl font-black text-white">Contact Our Support Team</h2>
        <p className="text-xs text-neutral-400">Have questions about setting up your restaurant or claiming your first-month free trial? We are here to help 24/7.</p>
        <div className="inline-block bg-neutral-900 border border-neutral-800 p-6 rounded-3xl space-y-2 text-xs">
          <p className="text-neutral-300 font-bold">📧 Email: <span className="text-orange-400 font-mono">digitaldining077@gmail.com</span></p>
          <p className="text-neutral-300 font-bold">📞 Partner Helpline: <span className="text-emerald-400 font-mono">+91 98765 43210</span></p>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-neutral-900 flex flex-col sm:flex-row justify-between items-center text-xs text-neutral-500 space-y-4 sm:space-y-0">
        <p>© 2026 Digital Dining SaaS. All rights reserved.</p>
        <div className="flex space-x-6">
          <a href="#pricing" className="text-neutral-400 hover:text-white">Pricing Plans</a>
          <a href="#contact" className="text-neutral-400 hover:text-white">Help Desk</a>
        </div>
      </footer>

    </div>
  )
}