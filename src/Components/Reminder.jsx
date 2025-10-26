import React from 'react'
import Header from './Header'
import './Reminder.css'

const Reminder = () => {
  return (
    <>
     <Header/>
     
  <main className='remindermain'>
<div className='remindermaindiv1'>
  <div>
<h5>Reminders</h5>
<p>4 reminders scheduled</p>
  </div>
  <button className='btnr '><i class="bi bi-plus"></i>Add Reminder</button>
  
</div>


<div class="searchdiv">

  <input type="search" placeholder="Search..." className='form-control search' />
</div>



<table className='remindertable'>
  <thead>
<tr>

    <th>Day</th>
    <th>Month</th>
    <th>Year</th>
    <th className='reminder'>Reminder</th>
    <th>Action</th>
  </tr>
  </thead>
  <tbody>

    <tr>
      <td>Mon</td>
      <td>Oct</td>
      <td>2025</td>
      <td className='remindertd'>
        <ul>
          <li>Do homework</li>
          <li>study lab</li>
        </ul>
      </td>
      <td><i class="bi bi-trash tabletrash"></i></td>
    </tr>



 <tr>
      <td>Mon2</td>
      <td>Oct2</td>
      <td>2025</td>
      <td className='remindertd'>
        <ul>
          <li>Do homework</li>
          <li>study lab</li>
          <li>revise ur h.w</li>
        </ul>
      </td>
       <td><i class="bi bi-trash tabletrash"></i></td>
    </tr>



    
      <tr>
      <td>Mon3</td>
      <td>Oct3</td>
      <td>2025</td>
      <td className='remindertd'>
        <ul>
          <li>Do homework</li>
          <li>study lab</li>
        </ul>
      </td>
       <td><i class="bi bi-trash tabletrash"></i></td>
    </tr>

  </tbody>
  
</table>

  </main>

 
    </>
    
  )
}

export default Reminder