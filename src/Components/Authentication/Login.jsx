import React from 'react'
import './Login.css'
const Login = () => {
  return (
    <>
<header className='loginheader container-fluid'>
    <div><i class="bi bi-book"></i></div>
 <h2>Welcome to Papyrus</h2>
 <p>Your AI-powered learning companion</p>
</header>
   
   <main className='loginmain'>
<form action="" className='loginform'>
<p className='loginp1'>Sign in to your account</p>
<label htmlFor="">Email</label>
<input type="email" placeholder='Enter Your Email' />
<label htmlFor="">Password</label>
<input type="password" placeholder='Enter Your Password'/>
<button>Sign In</button>
<p className='loginp2'>Don't have an account?<a href="">Sign up</a> </p>
</form>


   </main>

   <footer className='loginfooter'>
    <p>By signing in, you agree to our Terms of Service and Privacy Policy</p>
   </footer>
    </>
  )
}

export default Login